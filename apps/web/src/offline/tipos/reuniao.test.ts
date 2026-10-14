import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { criarSaidaEnvio } from '../../testes/handlers/chamada'
import { uuid } from '../../testes/handlers/sessao'
import type { ContextoAposEnvio, ItemFila } from '../index'
import { aoEnviar } from './reuniao'
import type { PayloadReuniaoFila } from './reuniao'

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), success: vi.fn() } }))

describe('aoEnviar da chamada de reunião', () => {
  it('invalida as consultas do envio normal, inclusive a visão geral, e baixa o pacote', async () => {
    const queryClient = new QueryClient()
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries')
    const baixarPacote = vi.fn(() => Promise.resolve())
    const ctx: ContextoAposEnvio<PayloadReuniaoFila> = {
      item: { payload: {} } as ItemFila<PayloadReuniaoFila>,
      queryClient,
      seguintesDaChave: () => Promise.resolve([]),
      atualizarPayload: () => Promise.resolve(),
      baixarPacote,
    }
    await aoEnviar(criarSaidaEnvio(uuid(700)), ctx)
    expect(invalidar.mock.calls.map(([filtro]) => filtro?.queryKey?.[0])).toEqual(['reunioes', 'reuniao', 'grade', 'inicio', 'ranking', 'visao-geral'])
    expect(baixarPacote).toHaveBeenCalledOnce()
  })
})
