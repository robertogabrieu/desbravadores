import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { enfileirar, registrarTipo } from '../offline'
import type { TipoFila } from '../offline'
import { banco } from '../offline/banco'
import { estadoOffline } from '../offline/estado'
import { pausarParaTrocaDePapel } from '../offline/motor'
import { servidor } from '../testes/servidor'
import { handlerPapelAtivo } from '../testes/handlers/auth'
import { criarEu, criarSessao, criarVinculo, handlersSessao } from '../testes/handlers/sessao'
import { renderizarRotas } from '../testes/renderizar'
import { GuardaRota } from './GuardaRota'
import { useSessao } from './useSessao'
import type { RouteObject } from 'react-router-dom'

const CANAL_DA_SESSAO = 'sessao'
const CONSELHEIRO = criarVinculo('CONSELHEIRO', 1)
const INSTRUTOR = criarVinculo('INSTRUTOR', 2)
const saidaOk = z.object({ ok: z.literal(true) })

const tipoFalso: TipoFila<{ valor: string }, typeof saidaOk> = {
  tipo: 'FALSO',
  rotulo: (carga) => `Falso ${carga.valor}`,
  detalhe: (carga) => carga.valor,
  fundir: (_anterior, novo) => novo,
  enviar: (item, ctx) => ctx.requisitar('/api/falso', { metodo: 'PUT', corpo: item.payload }),
  saida: saidaOk,
}

function Painel() {
  const { escolherPapel, sair, vinculoAtivo } = useSessao()
  return (
    <>
      <p>papel {vinculoAtivo?.papel}</p>
      <button onClick={() => void escolherPapel(CONSELHEIRO.id)}>conselheiro</button>
      <button onClick={() => void sair()}>sair</button>
    </>
  )
}

const rotas: RouteObject[] = [
  { element: <GuardaRota />, children: [{ path: '/', element: <Painel /> }] },
  { path: '/login', element: <p>tela de login</p> },
]

describe('troca de papel e a fila', () => {
  it('escolher o papel que já está em uso não deixa a fila parada', async () => {
    registrarTipo(tipoFalso)
    servidor.use(
      ...handlersSessao([CONSELHEIRO, INSTRUTOR], CONSELHEIRO.id),
      handlerPapelAtivo(criarSessao([CONSELHEIRO, INSTRUTOR], CONSELHEIRO.id)),
      http.put('/api/falso', () => HttpResponse.json({ ok: true })),
    )
    renderizarRotas(rotas, '/')
    await screen.findByText('papel CONSELHEIRO')

    await userEvent.click(screen.getByRole('button', { name: 'conselheiro' }))

    await waitFor(() => expect(estadoOffline.trocaParaVinculo).toBeNull())
    const id = await enfileirar({ tipo: 'FALSO', chave: 'k-mesmo-papel', payload: { valor: 'x' } })
    await waitFor(async () => expect((await banco.fila.get(id))?.estado).toBe('ENVIADO'))
  })

  it('escolher o papel avisa as outras abas', async () => {
    servidor.use(
      ...handlersSessao([CONSELHEIRO, INSTRUTOR], INSTRUTOR.id),
      handlerPapelAtivo(criarSessao([CONSELHEIRO, INSTRUTOR], CONSELHEIRO.id)),
    )
    const outraAba = new BroadcastChannel(CANAL_DA_SESSAO)
    const avisos: unknown[] = []
    outraAba.onmessage = (evento: MessageEvent<unknown>) => avisos.push(evento.data)
    renderizarRotas(rotas, '/')
    await screen.findByText('papel INSTRUTOR')

    await userEvent.click(screen.getByRole('button', { name: 'conselheiro' }))

    await waitFor(() => expect(avisos).toContainEqual({ tipo: 'PAPEL_TROCADO', vinculoId: CONSELHEIRO.id }))
    outraAba.close()
  })

  it('aviso de troca vindo de outra aba renova a sessão e reinicia o motor no vínculo novo', async () => {
    servidor.use(...handlersSessao([CONSELHEIRO, INSTRUTOR], CONSELHEIRO.id))
    renderizarRotas(rotas, '/')
    await screen.findByText('papel CONSELHEIRO')
    await waitFor(() => expect(estadoOffline.sessao?.vinculoId).toBe(CONSELHEIRO.id))

    // A outra aba trocou: o cookie de refresh e o /api/eu já respondem pelo instrutor.
    servidor.use(
      http.post('/api/auth/refresh', () => HttpResponse.json(criarSessao([CONSELHEIRO, INSTRUTOR], INSTRUTOR.id))),
      http.get('/api/eu', () => HttpResponse.json(criarEu([CONSELHEIRO, INSTRUTOR], INSTRUTOR.id))),
    )
    const outraAba = new BroadcastChannel(CANAL_DA_SESSAO)
    outraAba.postMessage({ tipo: 'PAPEL_TROCADO', vinculoId: INSTRUTOR.id })

    await waitFor(() => expect(estadoOffline.sessao?.vinculoId).toBe(INSTRUTOR.id))
    expect(await screen.findByText('papel INSTRUTOR')).toBeInTheDocument()
    expect(estadoOffline.trocaParaVinculo).toBeNull()
    outraAba.close()
  })

  it('aviso de outra aba: a fila fica pausada enquanto a sessão desta aba é renovada', async () => {
    servidor.use(...handlersSessao([CONSELHEIRO, INSTRUTOR], CONSELHEIRO.id))
    renderizarRotas(rotas, '/')
    await screen.findByText('papel CONSELHEIRO')
    await waitFor(() => expect(estadoOffline.sessao?.vinculoId).toBe(CONSELHEIRO.id))

    let soltarRenovacao: () => void = () => undefined
    const renovacaoPresa = new Promise<void>((resolver) => (soltarRenovacao = resolver))
    servidor.use(
      http.post('/api/auth/refresh', async () => {
        await renovacaoPresa
        return HttpResponse.json(criarSessao([CONSELHEIRO, INSTRUTOR], INSTRUTOR.id))
      }),
      http.get('/api/eu', () => HttpResponse.json(criarEu([CONSELHEIRO, INSTRUTOR], INSTRUTOR.id))),
    )
    const outraAba = new BroadcastChannel(CANAL_DA_SESSAO)
    outraAba.postMessage({ tipo: 'PAPEL_TROCADO', vinculoId: INSTRUTOR.id })

    await waitFor(() => expect(estadoOffline.trocaParaVinculo).toBe(INSTRUTOR.id))
    soltarRenovacao()
    await waitFor(() => expect(estadoOffline.sessao?.vinculoId).toBe(INSTRUTOR.id))
    expect(estadoOffline.trocaParaVinculo).toBeNull()
    outraAba.close()
  })

  it('aviso de outra aba com renovação recusada: a pausa sai e a fila volta como estava', async () => {
    servidor.use(...handlersSessao([CONSELHEIRO, INSTRUTOR], CONSELHEIRO.id))
    renderizarRotas(rotas, '/')
    await screen.findByText('papel CONSELHEIRO')
    servidor.use(http.post('/api/auth/refresh', () => HttpResponse.json({ codigo: 'NAO_AUTENTICADO', mensagem: 'x' }, { status: 401 })))
    const outraAba = new BroadcastChannel(CANAL_DA_SESSAO)
    outraAba.postMessage({ tipo: 'PAPEL_TROCADO', vinculoId: INSTRUTOR.id })

    await waitFor(() => expect(estadoOffline.trocaParaVinculo).toBeNull())
    expect(estadoOffline.sessao?.vinculoId).toBe(CONSELHEIRO.id)
    outraAba.close()
  })

  it('sair desfaz uma pausa de troca que tenha ficado pendente', async () => {
    servidor.use(...handlersSessao([CONSELHEIRO], CONSELHEIRO.id))
    renderizarRotas(rotas, '/')
    await screen.findByText('papel CONSELHEIRO')
    pausarParaTrocaDePapel(INSTRUTOR.id)

    await userEvent.click(screen.getByRole('button', { name: 'sair' }))

    await screen.findByText('tela de login')
    expect(estadoOffline.trocaParaVinculo).toBeNull()
  })
})
