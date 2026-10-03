import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { servidor } from '../testes/servidor'
import { criarClasseInstrutor } from '../testes/handlers/aulas'
import { criarPacote, criarPacoteInstrutor, handlerPacote } from '../testes/handlers/offline'
import { criarEu, criarVinculo } from '../testes/handlers/sessao'
import { ContextoDaSessao } from '../sessao/useSessao'
import type { ContextoSessao, Eu } from '../sessao/useSessao'
import { banco } from './banco'
import { usePacote } from './index'
import { baixarPacote } from './pacote'

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const vinculoA = criarVinculo('CONSELHEIRO', 1)
const vinculoB = criarVinculo('CONSELHEIRO', 2)
const eu = criarEu([vinculoA, vinculoB], vinculoA.id)
const USUARIO = eu.usuario.id

function contexto(logado: Eu | null): ContextoSessao {
  const nada = () => Promise.resolve()
  return {
    situacao: logado ? 'autenticada' : 'anonima',
    eu: logado,
    vinculoAtivo: logado?.vinculoAtivo ?? null,
    papel: logado?.vinculoAtivo?.papel ?? null,
    vinculos: logado?.vinculos ?? [],
    pode: () => false,
    entrar: nada,
    escolherPapel: nada,
    sair: nada,
    sairDeTodos: nada,
    reabrir: nada,
    relerSessao: () => Promise.resolve(logado ?? eu),
    avisoDeSaida: null,
    dispensarAvisoDeSaida: () => undefined,
  }
}

function comSessao(logado: Eu | null) {
  return ({ children }: { children: ReactNode }) => (
    <ContextoDaSessao.Provider value={contexto(logado)}>{children}</ContextoDaSessao.Provider>
  )
}

const guardar = (usuarioId: string, vinculoId: string, versao: string, baixadoEm = 1000) =>
  banco.pacotes.put({ usuarioId, vinculoId, pacote: criarPacote({ versao, usuarioId, vinculoId }), baixadoEm })

describe('usePacote', () => {
  it('sem sessão: sem pacote e sem carregar', () => {
    const { result } = renderHook(() => usePacote(), { wrapper: comSessao(null) })
    expect(result.current).toEqual({ pacote: null, carregando: false, baixadoEm: null })
  })

  it('carrega até a primeira leitura e devolve o pacote guardado com baixadoEm', async () => {
    await guardar(USUARIO, vinculoA.id, 'v1', 4242)
    const { result } = renderHook(() => usePacote(), { wrapper: comSessao(eu) })
    expect(result.current.carregando).toBe(true)
    await waitFor(() => expect(result.current.carregando).toBe(false))
    expect(result.current.pacote?.versao).toBe('v1')
    expect(result.current.baixadoEm).toBe(4242)
  })

  it('sem pacote guardado: nulo depois de carregar', async () => {
    const { result } = renderHook(() => usePacote(), { wrapper: comSessao(eu) })
    await waitFor(() => expect(result.current.carregando).toBe(false))
    expect(result.current).toEqual({ pacote: null, carregando: false, baixadoEm: null })
  })

  it('reage a um pacote regravado no banco', async () => {
    await guardar(USUARIO, vinculoA.id, 'v1')
    const { result } = renderHook(() => usePacote(), { wrapper: comSessao(eu) })
    await waitFor(() => expect(result.current.pacote?.versao).toBe('v1'))
    await act(async () => {
      await guardar(USUARIO, vinculoA.id, 'v2', 9000)
    })
    await waitFor(() => expect(result.current.pacote?.versao).toBe('v2'))
    expect(result.current.baixadoEm).toBe(9000)
  })

  it('reage a um download novo feito por baixarPacote', async () => {
    servidor.use(handlerPacote(criarPacote({ versao: 'v-novo' })))
    const { result } = renderHook(() => usePacote(), { wrapper: comSessao(eu) })
    await waitFor(() => expect(result.current.carregando).toBe(false))
    expect(result.current.pacote).toBeNull()
    await act(async () => {
      await baixarPacote(USUARIO, vinculoA.id)
    })
    await waitFor(() => expect(result.current.pacote?.versao).toBe('v-novo'))
  })

  it('pacote rebaixado com tarefa nova reemite: a tela recebe a versão nova', async () => {
    const tarefa = { id: uuid(600), registroAulaId: uuid(700), data: '2030-03-10', encerrada: false, itens: [{ requisitoId: uuid(11) }] }
    const comTarefas = (tarefas: (typeof tarefa)[]) => criarPacote({ versao: `com-${tarefas.length}`, instrutor: criarPacoteInstrutor({ classes: [criarClasseInstrutor({ tarefas })] }) })
    await banco.pacotes.put({ usuarioId: USUARIO, vinculoId: vinculoA.id, pacote: comTarefas([]), baixadoEm: 1000 })
    servidor.use(handlerPacote(comTarefas([tarefa])))
    const { result } = renderHook(() => usePacote(), { wrapper: comSessao(eu) })
    await waitFor(() => expect(result.current.pacote?.instrutor?.classes[0]?.tarefas).toEqual([]))
    await act(async () => {
      await baixarPacote(USUARIO, vinculoA.id)
    })
    await waitFor(() => expect(result.current.pacote?.instrutor?.classes[0]?.tarefas).toEqual([tarefa]))
  })

  it('isola por vínculo e por usuário', async () => {
    await guardar(USUARIO, vinculoA.id, 'do-vinculo-a')
    await guardar(USUARIO, vinculoB.id, 'do-vinculo-b')
    await guardar('outro-usuario', vinculoA.id, 'de-outro')
    const { result } = renderHook(() => usePacote(), { wrapper: comSessao(eu) })
    await waitFor(() => expect(result.current.pacote?.versao).toBe('do-vinculo-a'))
  })

  it('segue a troca de vínculo da sessão, sem mostrar o pacote do anterior', async () => {
    await guardar(USUARIO, vinculoA.id, 'do-vinculo-a')
    await guardar(USUARIO, vinculoB.id, 'do-vinculo-b')
    let atual: Eu = eu
    const Provedor = ({ children }: { children: ReactNode }) => (
      <ContextoDaSessao.Provider value={contexto(atual)}>{children}</ContextoDaSessao.Provider>
    )
    const { result, rerender } = renderHook(() => usePacote(), { wrapper: Provedor })
    await waitFor(() => expect(result.current.pacote?.versao).toBe('do-vinculo-a'))
    atual = criarEu([vinculoA, vinculoB], vinculoB.id)
    rerender()
    expect(result.current.pacote?.versao).not.toBe('do-vinculo-a')
    await waitFor(() => expect(result.current.pacote?.versao).toBe('do-vinculo-b'))
  })

  it('vínculo ativo nulo: sem pacote e sem carregar', () => {
    const { result } = renderHook(() => usePacote(), { wrapper: comSessao(criarEu([vinculoA], null)) })
    expect(result.current).toEqual({ pacote: null, carregando: false, baixadoEm: null })
  })
})
