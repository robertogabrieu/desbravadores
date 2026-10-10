import { QueryClient } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { servidor } from '../testes/servidor'
import { banco } from './banco'
import { definirConexao } from './conexao'
import { gravarIdentidade } from './identidade'
import { registrarTipo } from './index'
import type { ItemFila, TipoFila } from './index'
import { limparDadosDaSubstituicao, limparFilaDeAbertura, registrarSubstituicaoLocal } from './limpeza'
import { iniciarMotor, iniciarMotorDaSubstituicao } from './motor'
import { tempos } from './tempos'
import { criarEu, criarVinculo, uuid } from '../testes/handlers/sessao'

const MEMBRO = uuid(500)
const VINCULO_DO_MEMBRO = uuid(1)
const SUBSTITUICAO = uuid(950)
const OUTRA_SUBSTITUICAO = uuid(951)
const saidaOk = z.object({ ok: z.literal(true) })

const tipoFalso: TipoFila<{ valor: string }, typeof saidaOk> = {
  tipo: 'FALSO',
  rotulo: (carga) => `Falso ${carga.valor}`,
  detalhe: (carga) => carga.valor,
  fundir: (_anterior, novo) => novo,
  enviar: (item, ctx) => ctx.requisitar('/api/falso', { metodo: 'PUT', corpo: item.payload }),
  saida: saidaOk,
}

async function semear(usuarioId: string, parcial: Partial<ItemFila> = {}): Promise<ItemFila> {
  const item: ItemFila = {
    id: crypto.randomUUID(),
    versaoPayload: 1,
    usuarioId,
    vinculoId: usuarioId === MEMBRO ? VINCULO_DO_MEMBRO : usuarioId,
    tipo: 'FALSO',
    chave: `chave-${usuarioId}`,
    rotulo: 'r',
    detalhe: 'd',
    payload: { valor: usuarioId },
    estado: 'NA_FILA',
    progresso: 0,
    tentativas: 0,
    proximaTentativaEm: null,
    criadoEm: Date.now(),
    atualizadoEm: Date.now(),
    ...parcial,
  }
  await banco.fila.put(item)
  return item
}

async function semearDados(usuarioId: string, vinculoId: string): Promise<void> {
  const pacote = { usuarioId, vinculoId, pacote: {} as never, baixadoEm: Date.now() }
  await banco.pacotes.put(pacote)
  await banco.rascunhos.put({ usuarioId, chave: 'rascunho', valor: { a: 1 }, atualizadoEm: Date.now() })
}

/** Segura uma trava como outra aba faria (o substituto dos testes serializa por nome, como o navegador). */
function segurarTrava(nome: string): () => void {
  let soltar: () => void = () => undefined
  const segurando = new Promise<void>((resolver) => {
    soltar = resolver
  })
  void navigator.locks.request(nome, () => segurando)
  return soltar
}

function enviadosPeloServidor(): unknown[] {
  const enviados: unknown[] = []
  servidor.use(
    http.put('/api/falso', async ({ request }) => {
      enviados.push(await request.json())
      return HttpResponse.json({ ok: true })
    }),
  )
  return enviados
}

beforeEach(() => {
  tempos.backoffMs = [1, 1, 1, 1]
  registrarTipo(tipoFalso)
  localStorage.clear()
})

describe('critério 14: a fila do substituto com o app do membro aberto noutra aba', () => {
  it('com outra aba segurando a trava `fila`, o item do substituto sobe pela trava própria', async () => {
    const soltar = segurarTrava('fila')
    const enviados = enviadosPeloServidor()
    const item = await semear(SUBSTITUICAO)
    definirConexao('ONLINE')
    iniciarMotorDaSubstituicao({ usuarioId: SUBSTITUICAO, vinculoId: SUBSTITUICAO, queryClient: new QueryClient() })
    await waitFor(async () => expect((await banco.fila.get(item.id))?.estado).toBe('ENVIADO'))
    expect(enviados).toEqual([{ valor: SUBSTITUICAO }])
    soltar()
  })

  it('o motor da substituição só processa os itens da identidade dela', async () => {
    const enviados = enviadosPeloServidor()
    const doMembro = await semear(MEMBRO)
    const daSubstituicao = await semear(SUBSTITUICAO)
    definirConexao('ONLINE')
    iniciarMotorDaSubstituicao({ usuarioId: SUBSTITUICAO, vinculoId: SUBSTITUICAO, queryClient: new QueryClient() })
    await waitFor(async () => expect((await banco.fila.get(daSubstituicao.id))?.estado).toBe('ENVIADO'))
    expect((await banco.fila.get(doMembro.id))?.estado).toBe('NA_FILA')
    expect(enviados).toEqual([{ valor: SUBSTITUICAO }])
  })

  it('a sessão normal segue sob a trava `fila`: com ela segura por outra aba, o membro não envia', async () => {
    const soltar = segurarTrava('fila')
    const enviados = enviadosPeloServidor()
    const item = await semear(MEMBRO)
    definirConexao('ONLINE')
    iniciarMotor({ usuarioId: MEMBRO, vinculoId: VINCULO_DO_MEMBRO, queryClient: new QueryClient() })
    await new Promise((resolver) => setTimeout(resolver, 50))
    expect((await banco.fila.get(item.id))?.estado).toBe('NA_FILA')
    soltar()
    await waitFor(async () => expect((await banco.fila.get(item.id))?.estado).toBe('ENVIADO'))
    expect(enviados).toEqual([{ valor: MEMBRO }])
  })
})

describe('critério 15: dados locais da substituição', () => {
  it('o encerramento apaga fila, pacote e rascunhos da substituição e deixa os da conta', async () => {
    await gravarIdentidade(criarEu([criarVinculo('CONSELHEIRO', 1)]))
    const doMembro = await semear(MEMBRO)
    await semearDados(MEMBRO, VINCULO_DO_MEMBRO)
    await semear(SUBSTITUICAO)
    await semear(SUBSTITUICAO, { estado: 'ERRO', chave: 'outra' })
    await semearDados(SUBSTITUICAO, SUBSTITUICAO)
    registrarSubstituicaoLocal({ id: SUBSTITUICAO, fimEnvioEm: '2030-01-01T00:00:00.000Z' })

    await limparDadosDaSubstituicao(SUBSTITUICAO)

    expect(await banco.fila.where('[usuarioId+estado]').between([SUBSTITUICAO, ''], [SUBSTITUICAO, '￿']).count()).toBe(0)
    expect(await banco.pacotes.get([SUBSTITUICAO, SUBSTITUICAO])).toBeUndefined()
    expect(await banco.rascunhos.get([SUBSTITUICAO, 'rascunho'])).toBeUndefined()
    expect(await banco.fila.get(doMembro.id)).toBeDefined()
    expect(await banco.pacotes.get([MEMBRO, VINCULO_DO_MEMBRO])).toBeDefined()
    expect(await banco.rascunhos.get([MEMBRO, 'rascunho'])).toBeDefined()
    expect(await banco.sessoes.get(MEMBRO)).toBeDefined()
    expect(JSON.parse(localStorage.getItem('substituicoes-locais') ?? '[]')).toEqual([])
  })

  it('a limpeza de abertura apaga a substituição de fim do envio passado e preserva a vigente e a conta', async () => {
    const agora = Date.parse('2026-10-12T10:00:00.000Z')
    await gravarIdentidade(criarEu([criarVinculo('CONSELHEIRO', 1)]), agora)
    const doMembro = await semear(MEMBRO, { criadoEm: agora, atualizadoEm: agora })
    await semearDados(MEMBRO, VINCULO_DO_MEMBRO)
    await semear(SUBSTITUICAO, { criadoEm: agora, atualizadoEm: agora })
    await semearDados(SUBSTITUICAO, SUBSTITUICAO)
    const daVigente = await semear(OUTRA_SUBSTITUICAO, { criadoEm: agora, atualizadoEm: agora })
    await semearDados(OUTRA_SUBSTITUICAO, OUTRA_SUBSTITUICAO)
    registrarSubstituicaoLocal({ id: SUBSTITUICAO, fimEnvioEm: '2026-10-12T03:00:00.000Z' })
    registrarSubstituicaoLocal({ id: OUTRA_SUBSTITUICAO, fimEnvioEm: '2026-10-13T03:00:00.000Z' })

    await limparFilaDeAbertura(agora)

    expect(await banco.fila.where('[usuarioId+estado]').between([SUBSTITUICAO, ''], [SUBSTITUICAO, '￿']).count()).toBe(0)
    expect(await banco.pacotes.get([SUBSTITUICAO, SUBSTITUICAO])).toBeUndefined()
    expect(await banco.rascunhos.get([SUBSTITUICAO, 'rascunho'])).toBeUndefined()
    expect(await banco.fila.get(daVigente.id)).toBeDefined()
    expect(await banco.pacotes.get([OUTRA_SUBSTITUICAO, OUTRA_SUBSTITUICAO])).toBeDefined()
    expect(await banco.fila.get(doMembro.id)).toBeDefined()
    expect(await banco.pacotes.get([MEMBRO, VINCULO_DO_MEMBRO])).toBeDefined()
    expect(await banco.rascunhos.get([MEMBRO, 'rascunho'])).toBeDefined()
    expect(JSON.parse(localStorage.getItem('substituicoes-locais') ?? '[]')).toEqual([
      { id: OUTRA_SUBSTITUICAO, fimEnvioEm: '2026-10-13T03:00:00.000Z' },
    ])
  })

  it('lista guardada ilegível não impede a abertura', async () => {
    localStorage.setItem('substituicoes-locais', '{quebrado')
    await expect(limparFilaDeAbertura()).resolves.toEqual({ descartadosDeOutraPessoa: 0 })
  })
})
