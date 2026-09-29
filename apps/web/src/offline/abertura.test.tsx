import { act, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { servidor } from '../testes/servidor'
import { criarEu, criarVinculo, handlersSessao } from '../testes/handlers/sessao'
import {
  criarPacote,
  handlerPacote,
  handlerRefreshForaDoContrato,
  handlerRefreshPortal,
  handlerRefreshRecusado,
  handlerRefreshSemRede,
  handlerRefreshServidor,
} from '../testes/handlers/offline'
import { renderizarRotas } from '../testes/renderizar'
import { GuardaRota } from '../sessao/GuardaRota'
import { useSessao } from '../sessao/useSessao'
import { requisitar } from '../api/cliente'
import { z } from 'zod'
import { banco } from './banco'
import { useConexao, useModoSessao } from './index'
import { limparDadosDoUsuario } from './limpeza'
import { baixarPacote } from './pacote'
import { tempos } from './tempos'
import type { RouteObject } from 'react-router-dom'

const DIA = 24 * 3_600_000
const vinculos = [criarVinculo('CONSELHEIRO')]
const eu = criarEu(vinculos)
const USUARIO = eu.usuario.id
const VINCULO = vinculos[0]?.id ?? ''

function Painel() {
  const { modo } = useConexao()
  const modoSessao = useModoSessao()
  const { eu: logado, sair } = useSessao()
  return (
    <div>
      <p>modo:{modo}</p>
      <p>sessao:{modoSessao}</p>
      <p>nome:{logado?.usuario.nome}</p>
      <button onClick={() => void requisitar('/api/coisa', z.object({})).catch(() => undefined)}>usar</button>
      <button onClick={() => void sair()}>sair</button>
    </div>
  )
}

const rotas: RouteObject[] = [
  { path: '/login', element: <p>tela de login</p> },
  { path: '/papel', element: <p>tela de papel</p> },
  { path: '/conectar', element: <p>tela conectar</p> },
  { element: <GuardaRota />, children: [{ path: '/privada', element: <Painel /> }] },
]

async function guardarIdentidade(ultimoContatoEm: number) {
  await banco.sessoes.put({ usuarioId: USUARIO, eu, ultimoContatoEm })
  await banco.pacotes.put({ usuarioId: USUARIO, vinculoId: VINCULO, pacote: criarPacote(), baixadoEm: Date.now() })
  await banco.rascunhos.put({ usuarioId: USUARIO, chave: 'r', valor: 1, atualizadoEm: Date.now() })
}

async function semearFila() {
  await banco.fila.put({
    id: 'item-1',
    versaoPayload: 1,
    usuarioId: USUARIO,
    vinculoId: VINCULO,
    tipo: 'DESCONHECIDO',
    chave: 'c',
    rotulo: 'r',
    detalhe: 'd',
    payload: {},
    estado: 'ERRO',
    progresso: 0,
    tentativas: 1,
    proximaTentativaEm: null,
    criadoEm: Date.now(),
    atualizadoEm: Date.now(),
  })
}

beforeEach(() => {
  tempos.novaTentativaAberturaMs = 1
  tempos.recuperacaoMs = 60_000
})

describe('abertura sem internet', () => {
  it('rede cai com identidade de menos de 7 dias: abre em modo sem conexão com a identidade guardada', async () => {
    await guardarIdentidade(Date.now() - 2 * DIA)
    servidor.use(handlerRefreshSemRede())

    renderizarRotas(rotas, '/privada')

    expect(await screen.findByText('modo:SEM_CONEXAO')).toBeInTheDocument()
    expect(screen.getByText('nome:Ana Souza')).toBeInTheDocument()
  })

  it('tenta de novo uma vez antes de desistir', async () => {
    await guardarIdentidade(Date.now())
    let tentativas = 0
    servidor.use(
      http.post('/api/auth/refresh', () => {
        tentativas += 1
        return HttpResponse.error()
      }),
    )

    renderizarRotas(rotas, '/privada')

    await screen.findByText('modo:SEM_CONEXAO')
    expect(tentativas).toBe(2)
  })

  it('identidade de mais de 7 dias vai a /conectar', async () => {
    await guardarIdentidade(Date.now() - 8 * DIA)
    servidor.use(handlerRefreshSemRede())

    const { roteador } = renderizarRotas(rotas, '/privada')

    await screen.findByText('tela conectar')
    expect(roteador.state.location.pathname).toBe('/conectar')
  })

  it('sem identidade guardada vai a /conectar', async () => {
    servidor.use(handlerRefreshSemRede())

    renderizarRotas(rotas, '/privada')

    expect(await screen.findByText('tela conectar')).toBeInTheDocument()
  })

  it.each([
    ['servidor fora (503)', handlerRefreshServidor(503)],
    ['200 fora do contrato', handlerRefreshForaDoContrato()],
    ['403 com HTML de portal de Wi-Fi', handlerRefreshPortal()],
  ])('%s conta como rede: sem conexão e nada é apagado', async (_nome, handler) => {
    await guardarIdentidade(Date.now())
    servidor.use(handler)

    renderizarRotas(rotas, '/privada')

    expect(await screen.findByText('modo:SEM_CONEXAO')).toBeInTheDocument()
    expect(await banco.pacotes.count()).toBe(1)
    expect(await banco.sessoes.count()).toBe(1)
  })

  it('refresh recusado (401): vai ao login, apaga pacote, identidade e rascunhos e deixa a fila intacta', async () => {
    await guardarIdentidade(Date.now())
    await semearFila()
    servidor.use(handlerRefreshRecusado(401))

    const { roteador } = renderizarRotas(rotas, '/privada')

    await screen.findByText('tela de login')
    expect(roteador.state.location.pathname).toBe('/login')
    await waitFor(async () => expect(await banco.pacotes.count()).toBe(0))
    expect(await banco.sessoes.count()).toBe(0)
    expect(await banco.rascunhos.count()).toBe(0)
    expect(await banco.fila.count()).toBe(1)
  })

  it('403 VINCULO_INATIVO no refresh apaga o guardado e leva a /papel', async () => {
    await guardarIdentidade(Date.now())
    servidor.use(handlerRefreshRecusado(403, 'VINCULO_INATIVO'))

    const { roteador } = renderizarRotas(rotas, '/privada')

    await waitFor(async () => expect(await banco.pacotes.count()).toBe(0))
    expect(roteador.state.location.pathname).toBe('/papel')
  })

  it('a rede volta: o evento online renova a sessão e o app vira online sem recarregar', async () => {
    await guardarIdentidade(Date.now())
    servidor.use(handlerRefreshSemRede())
    renderizarRotas(rotas, '/privada')
    await screen.findByText('modo:SEM_CONEXAO')

    servidor.use(...handlersSessao(vinculos))
    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(await screen.findByText('modo:ONLINE')).toBeInTheDocument()
    expect(screen.getByText('nome:Ana Souza')).toBeInTheDocument()
  })

  it('ao voltar a conexão baixa o pacote mesmo com o guardado de menos de 15 min', async () => {
    await guardarIdentidade(Date.now())
    servidor.use(handlerRefreshSemRede())
    renderizarRotas(rotas, '/privada')
    await screen.findByText('modo:SEM_CONEXAO')
    const chamadas = { total: 0 }
    servidor.use(handlerPacote(criarPacote(), chamadas), ...handlersSessao(vinculos))

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    await screen.findByText('modo:ONLINE')
    await waitFor(() => expect(chamadas.total).toBe(1))
  })

  it('a cada intervalo com a aba visível também tenta renovar', async () => {
    tempos.recuperacaoMs = 20
    await guardarIdentidade(Date.now())
    servidor.use(handlerRefreshSemRede())
    renderizarRotas(rotas, '/privada')
    await screen.findByText('modo:SEM_CONEXAO')

    servidor.use(...handlersSessao(vinculos))

    expect(await screen.findByText('modo:ONLINE')).toBeInTheDocument()
  })
})

describe('abertura online', () => {
  it('grava a identidade, baixa o pacote e limpa o que venceu', async () => {
    const chamadas = { total: 0 }
    servidor.use(handlerPacote(criarPacote({ usuarioId: USUARIO, vinculoId: VINCULO }), chamadas), ...handlersSessao(vinculos))

    renderizarRotas(rotas, '/privada')

    expect(await screen.findByText('modo:ONLINE')).toBeInTheDocument()
    await waitFor(async () => expect(await banco.pacotes.count()).toBe(1))
    expect(chamadas.total).toBe(1)
    const identidade = await banco.sessoes.get(USUARIO)
    expect(identidade?.ultimoContatoEm).toBeGreaterThan(Date.now() - 5000)
  })

  it('não baixa o pacote de novo quando o guardado tem menos de 15 min', async () => {
    await guardarIdentidade(Date.now())
    const chamadas = { total: 0 }
    servidor.use(handlerPacote(criarPacote(), chamadas), ...handlersSessao(vinculos))

    renderizarRotas(rotas, '/privada')

    await screen.findByText('modo:ONLINE')
    await new Promise((resolver) => setTimeout(resolver, 30))
    expect(chamadas.total).toBe(0)
  })

  it('sair durante o download do pacote: o download que chega depois não regrava a lista (E18)', async () => {
    let liberar: () => void = () => undefined
    const portao = new Promise<void>((resolver) => {
      liberar = resolver
    })
    servidor.use(
      http.get('/api/sync/pacote', async () => {
        await portao
        return HttpResponse.json(criarPacote())
      }),
    )
    const download = baixarPacote(USUARIO, VINCULO)

    await limparDadosDoUsuario(USUARIO, { manterFila: true })
    liberar()
    await download

    expect(await banco.pacotes.count()).toBe(0)
  })

  it('401 durante o uso, sem refresh possível: modo EXPIRADA e a sessão não some da tela', async () => {
    servidor.use(
      ...handlersSessao(vinculos),
      http.get('/api/coisa', () => HttpResponse.json({ codigo: 'NAO_AUTENTICADO', mensagem: 'expirou' }, { status: 401 })),
    )
    renderizarRotas(rotas, '/privada')
    await screen.findByText('sessao:ONLINE')
    servidor.use(handlerRefreshRecusado(401))

    act(() => screen.getByRole('button', { name: 'usar' }).click())

    expect(await screen.findByText('sessao:EXPIRADA')).toBeInTheDocument()
  })

  it('sair guarda a fila e apaga pacote, identidade e rascunhos', async () => {
    await guardarIdentidade(Date.now())
    await semearFila()
    servidor.use(...handlersSessao(vinculos))
    const { roteador } = renderizarRotas(rotas, '/privada')
    await screen.findByText('modo:ONLINE')

    act(() => screen.getByRole('button', { name: 'sair' }).click())

    await waitFor(() => expect(roteador.state.location.pathname).toBe('/login'))
    await waitFor(async () => expect(await banco.sessoes.count()).toBe(0))
    expect(await banco.pacotes.count()).toBe(0)
    expect(await banco.rascunhos.count()).toBe(0)
    expect(await banco.fila.count()).toBe(1)
  })
})
