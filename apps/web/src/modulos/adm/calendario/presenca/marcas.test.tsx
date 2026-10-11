import { act, waitFor } from '@testing-library/react'
import { HttpResponse } from 'msw'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { caixa } from '../../../../testes/handlers/caixa'
import { criarLinha, criarPresenca, criarUnidadeDaPresenca, erroDaGravacao, handlersPresenca } from '../../../../testes/handlers/presenca'
import type { OpcoesDaPresenca } from '../../../../testes/handlers/presenca'
import { uuid } from '../../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../../testes/renderizar'
import { servidor } from '../../../../testes/servidor'
import { useMarcasDaPresenca } from './useMarcasDaPresenca'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as 'ONLINE' | 'SEM_CONEXAO' }))
vi.mock('../../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

const EVENTO = uuid(801)
const ANA = criarLinha(1, { nome: 'Ana Clara Souza' })
const ENZO = criarLinha(2, { nome: 'Enzo Barros' })
const JULIA = criarLinha(3, { nome: 'Júlia Ramos' })

type Hook = ReturnType<typeof useMarcasDaPresenca>
let atual: Hook
let rerenderizar: () => void

function Harness() {
  const [, setTique] = useState(0)
  rerenderizar = () => setTique((t) => t + 1)
  atual = useMarcasDaPresenca(EVENTO)
  return null
}

beforeEach(() => {
  estado.modo = 'ONLINE'
})
afterEach(() => {
  vi.useRealTimers()
})

async function abrir(opcoes: OpcoesDaPresenca = {}, linhas = [ANA, ENZO, JULIA]) {
  const lista = caixa(criarPresenca([criarUnidadeDaPresenca('Águias', linhas, uuid(200))]))
  servidor.use(...handlersPresenca(lista, opcoes))
  const montado = renderizarRotas([{ path: '/', element: <Harness /> }])
  await waitFor(() => expect(atual.consulta.data).toBeDefined())
  return { lista, ...montado }
}

/** PUT que só responde quando o teste manda: mostra o que a tela exibe enquanto o servidor não confirmou. */
function portao() {
  const pendentes: Array<() => void> = []
  const chegadas: string[][] = []
  return {
    chegadas,
    soltarUm: () => pendentes.shift()?.(),
    antesDeGravar: (corpo: { marcas: Array<{ dbvId: string }> }) => {
      chegadas.push(corpo.marcas.map((m) => m.dbvId))
      return new Promise<undefined>((resolver) => pendentes.push(() => resolver(undefined)))
    },
  }
}

describe('useMarcasDaPresenca', () => {
  it('a marca só vira marcada depois que o servidor confirma', async () => {
    const espera = portao()
    await abrir({ antesDeGravar: espera.antesDeGravar })
    expect(atual.marcaDe(ANA.dbvId)).toMatchObject({ foi: false, situacao: 'salva' })

    act(() => atual.marcar(ANA.dbvId, { foi: true }))
    await waitFor(() => expect(espera.chegadas).toHaveLength(1))
    expect(atual.marcaDe(ANA.dbvId)).toMatchObject({ foi: false, situacao: 'salvando' })
    expect(atual.pendentes).toBe(1)
    expect(atual.salvoAs).toBeNull()

    act(() => espera.soltarUm())
    await waitFor(() => expect(atual.marcaDe(ANA.dbvId)).toMatchObject({ foi: true, situacao: 'salva' }))
    expect(atual.pendentes).toBe(0)
    expect(atual.salvoAs).toBeInstanceOf(Date)
  })

  it('grava uma de cada vez, na ordem dos toques', async () => {
    const espera = portao()
    await abrir({ antesDeGravar: espera.antesDeGravar })

    act(() => {
      atual.marcar(ANA.dbvId, { foi: true })
      atual.marcar(ENZO.dbvId, { foi: true })
    })
    await waitFor(() => expect(espera.chegadas).toHaveLength(1))
    // O segundo toque espera: enquanto o primeiro não volta, só uma requisição saiu.
    await new Promise((resolver) => setTimeout(resolver, 50))
    expect(espera.chegadas).toEqual([[ANA.dbvId]])
    expect(atual.marcaDe(ENZO.dbvId).situacao).toBe('salvando')

    act(() => espera.soltarUm())
    await waitFor(() => expect(espera.chegadas).toEqual([[ANA.dbvId], [ENZO.dbvId]]))
    act(() => espera.soltarUm())
    await waitFor(() => expect(atual.pendentes).toBe(0))
    expect(atual.marcaDe(ENZO.dbvId)).toMatchObject({ foi: true, situacao: 'salva' })
  })

  it('uma marca que falha fica "falhou", as outras seguem salvas, e "tentar de novo" grava só aquela', async () => {
    const corpos: string[][] = []
    let falhar = true
    await abrir({
      antesDeGravar: (corpo) => {
        corpos.push(corpo.marcas.map((m) => m.dbvId))
        return falhar && corpo.marcas[0]?.dbvId === ENZO.dbvId ? erroDaGravacao() : undefined
      },
    })

    act(() => {
      atual.marcar(ENZO.dbvId, { foi: true })
      atual.marcar(JULIA.dbvId, { foi: true })
    })
    await waitFor(() => expect(atual.marcaDe(JULIA.dbvId)).toMatchObject({ foi: true, situacao: 'salva' }))
    expect(atual.marcaDe(ENZO.dbvId)).toMatchObject({ foi: false, situacao: 'falhou' })
    expect(atual.pendentes).toBe(1)

    falhar = false
    corpos.length = 0
    act(() => atual.tentarDeNovo(ENZO.dbvId))
    await waitFor(() => expect(atual.marcaDe(ENZO.dbvId)).toMatchObject({ foi: true, situacao: 'salva' }))
    expect(corpos).toEqual([[ENZO.dbvId]])
    expect(atual.pendentes).toBe(0)
  })

  it('o botão em massa é uma requisição só, com todas as marcas', async () => {
    const corpos: unknown[] = []
    await abrir({
      antesDeGravar: (corpo) => {
        corpos.push(corpo)
        return undefined
      },
    })

    act(() =>
      atual.marcarEmMassa([
        { dbvId: ANA.dbvId, foi: true },
        { dbvId: ENZO.dbvId, foi: true },
        { dbvId: JULIA.dbvId, foi: true },
      ]),
    )
    await waitFor(() => expect(atual.marcaDe(JULIA.dbvId)).toMatchObject({ foi: true, situacao: 'salva' }))
    expect(corpos).toHaveLength(1)
    expect(corpos[0]).toEqual({
      marcas: [
        { dbvId: ANA.dbvId, foi: true },
        { dbvId: ENZO.dbvId, foi: true },
        { dbvId: JULIA.dbvId, foi: true },
      ],
    })
    expect(atual.totais).toEqual({ foram: 3, uniformizados: 0, total: 3 })
  })

  it('a falha de uma gravação em massa marca todas as pessoas dela, e tentar de novo refaz a requisição inteira', async () => {
    const corpos: unknown[] = []
    let falhar = true
    await abrir({
      antesDeGravar: (corpo) => {
        corpos.push(corpo)
        return falhar ? erroDaGravacao() : undefined
      },
    })

    act(() =>
      atual.marcarEmMassa([
        { dbvId: ANA.dbvId, foi: true },
        { dbvId: ENZO.dbvId, foi: true },
      ]),
    )
    await waitFor(() => expect(atual.marcaDe(ANA.dbvId).situacao).toBe('falhou'))
    expect(atual.marcaDe(ENZO.dbvId).situacao).toBe('falhou')
    expect(atual.pendentes).toBe(2)

    falhar = false
    act(() => atual.tentarDeNovo(ANA.dbvId))
    await waitFor(() => expect(atual.pendentes).toBe(0))
    expect(corpos).toHaveLength(2)
    expect(atual.marcaDe(ENZO.dbvId)).toMatchObject({ foi: true, situacao: 'salva' })
  })

  it('reconcilia com as linhas que o servidor devolve, não com o que o toque pretendia', async () => {
    const { lista } = await abrir({
      antesDeGravar: () => {
        // Outro Adm já tinha posto Ana de gala: o servidor devolve a linha dele, com o uniforme.
        lista.atual = {
          ...lista.atual,
          unidades: lista.atual.unidades.map((u) => ({ ...u, linhas: u.linhas.map((l) => (l.dbvId === ANA.dbvId ? { ...l, comUniforme: true } : l)) })),
        }
        return undefined
      },
    })

    act(() => atual.marcar(ANA.dbvId, { foi: true }))
    await waitFor(() => expect(atual.marcaDe(ANA.dbvId).situacao).toBe('salva'))
    expect(atual.marcaDe(ANA.dbvId)).toMatchObject({ foi: true, comUniforme: true })
    expect(atual.totais).toEqual({ foram: 1, uniformizados: 1, total: 3 })
  })

  it('refaz a leitura ao voltar o foco para a aba', async () => {
    let leituras = 0
    const { lista } = await abrir({ aoLer: () => (leituras += 1) })
    expect(leituras).toBe(1)

    lista.atual = {
      ...lista.atual,
      unidades: lista.atual.unidades.map((u) => ({ ...u, linhas: u.linhas.map((l) => (l.dbvId === JULIA.dbvId ? { ...l, foi: true } : l)) })),
    }
    act(() => {
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(leituras).toBe(2))
    await waitFor(() => expect(atual.marcaDe(JULIA.dbvId)).toMatchObject({ foi: true, situacao: 'salva' }))
  })

  it('a leitura que volta não apaga a marca que ainda não foi confirmada', async () => {
    const espera = portao()
    await abrir({ antesDeGravar: espera.antesDeGravar })
    act(() => atual.marcar(ANA.dbvId, { foi: true }))
    await waitFor(() => expect(espera.chegadas).toHaveLength(1))

    await act(async () => {
      await atual.consulta.refetch()
    })
    expect(atual.marcaDe(ANA.dbvId)).toMatchObject({ foi: false, situacao: 'salvando' })
    act(() => espera.soltarUm())
    await waitFor(() => expect(atual.marcaDe(ANA.dbvId)).toMatchObject({ foi: true, situacao: 'salva' }))
  })

  it('sem internet não aceita toque novo, e as marcas sem confirmação continuam contadas', async () => {
    const corpos: unknown[] = []
    await abrir({
      antesDeGravar: (corpo) => {
        corpos.push(corpo)
        return HttpResponse.error()
      },
    })

    act(() => atual.marcar(ANA.dbvId, { foi: true }))
    await waitFor(() => expect(atual.marcaDe(ANA.dbvId).situacao).toBe('falhou'))
    expect(atual.pendentes).toBe(1)

    estado.modo = 'SEM_CONEXAO'
    act(() => rerenderizar())
    act(() => {
      atual.marcar(ENZO.dbvId, { foi: true })
      atual.marcarEmMassa([{ dbvId: JULIA.dbvId, foi: true }])
    })
    await new Promise((resolver) => setTimeout(resolver, 50))
    expect(corpos).toHaveLength(1)
    expect(atual.marcaDe(ENZO.dbvId)).toMatchObject({ foi: false, situacao: 'salva' })
    expect(atual.pendentes).toBe(1)
    expect(atual.idsPendentes).toEqual([ANA.dbvId])
  })

  it('o salvoAs é a hora da última confirmação', async () => {
    const montado = await abrir()
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-03T19:42:00.000Z') })
    act(() => atual.marcar(ANA.dbvId, { foi: true }))
    await waitFor(() => expect(atual.salvoAs?.toISOString()).toBe('2026-10-03T19:42:00.000Z'))
    expect(montado.lista.atual.resumo.foram).toBe(1)
  })

  it('depois de gravar, invalida calendário, visão geral e ranking', async () => {
    const montado = await abrir()
    const invalidar = vi.spyOn(montado.clienteConsultas, 'invalidateQueries')
    act(() => atual.marcar(ANA.dbvId, { foi: true }))
    await waitFor(() => expect(atual.marcaDe(ANA.dbvId).situacao).toBe('salva'))
    const chaves = invalidar.mock.calls.map(([filtro]) => (filtro as { queryKey?: unknown[] } | undefined)?.queryKey)
    expect(chaves).toEqual(expect.arrayContaining([['calendario'], ['visao-geral'], ['ranking']]))
  })
})
