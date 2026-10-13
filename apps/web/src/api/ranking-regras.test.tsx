import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { handlerRedeCaidaAoSalvarRegra } from '../testes/handlers/ranking-regras'
import { servidor } from '../testes/servidor'
import { useSalvarRegra } from './ranking-regras'

describe('useSalvarRegra · sem rede', () => {
  afterEach(() => onlineManager.setOnline(true))

  it('com o navegador offline a gravação tenta e falha, em vez de ficar pausada para sempre', async () => {
    onlineManager.setOnline(false)
    servidor.use(handlerRedeCaidaAoSalvarRegra())
    // Cliente sem os padrões do app: o modo de rede tem de vir da própria mutação.
    const cliente = new QueryClient()
    const envolver = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useSalvarRegra(), { wrapper: envolver })

    act(() => result.current.mutate({ gatilho: 'PRESENCA', pontos: 12, ativo: true }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.isPaused).toBe(false)
  })
})
