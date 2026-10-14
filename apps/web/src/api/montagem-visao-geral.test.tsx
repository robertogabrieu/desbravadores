import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CLASSE_MONTAGEM, criarMontagemDeExemplo, handlersMontagem } from '../testes/handlers/montagem'
import { servidor } from '../testes/servidor'
import { useCriarCronograma } from './montagem'
import { chavesVisaoGeral } from './visao-geral'

describe('criar cronograma atualiza a visão geral', () => {
  it('invalida a visão geral ao criar', async () => {
    servidor.use(...handlersMontagem(criarMontagemDeExemplo()).handlers)
    const cliente = new QueryClient({ defaultOptions: { mutations: { networkMode: 'always' } } })
    const invalidar = vi.spyOn(cliente, 'invalidateQueries')
    const envolver = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useCriarCronograma(CLASSE_MONTAGEM.id, 2026), { wrapper: envolver })
    act(() => result.current.mutate({ classeId: CLASSE_MONTAGEM.id, anoClube: 2026, inicio: '2026-03-01', fim: '2026-12-31' }))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidar.mock.calls.map(([filtro]) => filtro?.queryKey)).toContainEqual(chavesVisaoGeral.todas)
  })
})
