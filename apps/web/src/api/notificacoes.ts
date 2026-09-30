import { NotificacoesSaida } from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { requisitar, requisitarSemResposta } from './cliente'

export type Notificacoes = z.infer<typeof NotificacoesSaida>
export type NotificacaoItem = Notificacoes['itens'][number]

export const INTERVALO_DO_SINO_MS = 120_000

export const chavesNotificacoes = { todas: ['notificacoes'] as const }

/** Busca ao montar e a cada 2 min; o TanStack pausa o intervalo com a aba escondida. `ativa: false` não busca (sem conexão). */
export function useNotificacoes(ativa = true) {
  return useQuery({
    queryKey: chavesNotificacoes.todas,
    queryFn: () => requisitar('/api/notificacoes', NotificacoesSaida),
    enabled: ativa,
    refetchInterval: INTERVALO_DO_SINO_MS,
    refetchIntervalInBackground: false,
  })
}

export function useMarcarLida() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => requisitarSemResposta(`/api/notificacoes/${id}/lida`, { metodo: 'POST' }),
    onSettled: () => clienteConsultas.invalidateQueries({ queryKey: chavesNotificacoes.todas }),
  })
}

export function useMarcarTodasLidas() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    mutationFn: () => requisitarSemResposta('/api/notificacoes/lidas', { metodo: 'POST' }),
    onSettled: () => clienteConsultas.invalidateQueries({ queryKey: chavesNotificacoes.todas }),
  })
}
