import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { handlerCriarEvento, handlerEditarEvento, handlerExcluirEvento } from '../testes/handlers/calendario'
import { uuid } from '../testes/handlers/sessao'
import { servidor } from '../testes/servidor'
import { useCriarEvento, useEditarEvento, useExcluirEvento } from './calendario'
import type { NovoEvento } from './calendario'
import { chavesVisaoGeral } from './visao-geral'

const entrada: NovoEvento = {
  nome: 'Culto Jovem',
  tipo: 'EVENTO',
  inicio: '2026-10-17',
  fim: '2026-10-17',
  horario: null,
  local: null,
  temReuniao: true,
  temClasse: false,
  bomParaCampo: false,
}

function montar<T>(hook: () => T) {
  const cliente = new QueryClient({ defaultOptions: { mutations: { networkMode: 'always' } } })
  const invalidar = vi.spyOn(cliente, 'invalidateQueries')
  const envolver = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  return { ...renderHook(hook, { wrapper: envolver }), invalidar }
}

const chavesInvalidadas = (invalidar: ReturnType<typeof montar>['invalidar']) => invalidar.mock.calls.map(([filtro]) => filtro?.queryKey)

describe('eventos do calendário atualizam a visão geral', () => {
  it('criar evento invalida a visão geral', async () => {
    servidor.use(handlerCriarEvento())
    const { result, invalidar } = montar(useCriarEvento)
    act(() => result.current.mutate(entrada))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(chavesInvalidadas(invalidar)).toContainEqual(chavesVisaoGeral.todas)
  })

  it('editar evento invalida a visão geral', async () => {
    servidor.use(handlerEditarEvento())
    const { result, invalidar } = montar(useEditarEvento)
    act(() => result.current.mutate({ id: uuid(5), entrada }))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(chavesInvalidadas(invalidar)).toContainEqual(chavesVisaoGeral.todas)
  })

  it('excluir evento invalida a visão geral', async () => {
    servidor.use(handlerExcluirEvento())
    const { result, invalidar } = montar(useExcluirEvento)
    act(() => result.current.mutate(uuid(5)))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(chavesInvalidadas(invalidar)).toContainEqual(chavesVisaoGeral.todas)
  })
})
