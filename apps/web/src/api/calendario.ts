import { CalendarioSaida, EventoEntrada, EventoGravadoSaida } from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { requisitar, requisitarSemResposta } from './cliente'

export type Calendario = z.infer<typeof CalendarioSaida>
export type EventoCalendario = Calendario['eventos'][number]
export type EventoGravado = z.infer<typeof EventoGravadoSaida>
export type AulaAfetada = EventoGravado['aulasAfetadas'][number]
export type NovoEvento = z.input<typeof EventoEntrada>

export const chavesCalendario = {
  todas: ['calendario'] as const,
  ano: (ano: number) => ['calendario', ano] as const,
}

/** Eventos que tocam o ano civil e os dias de reunião que sobram deles. */
export function useCalendario(ano: number) {
  return useQuery({
    queryKey: chavesCalendario.ano(ano),
    queryFn: () => requisitar(`/api/calendario?ano=${ano}`, CalendarioSaida),
  })
}

export function useCriarEvento() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (entrada: NovoEvento) =>
      requisitar('/api/calendario/eventos', EventoGravadoSaida, { metodo: 'POST', corpo: EventoEntrada.parse(entrada) }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: chavesCalendario.todas }),
  })
}

export function useEditarEvento() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: ({ id, entrada }: { id: string; entrada: NovoEvento }) =>
      requisitar(`/api/calendario/eventos/${id}`, EventoGravadoSaida, { metodo: 'PATCH', corpo: EventoEntrada.parse(entrada) }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: chavesCalendario.todas }),
  })
}

export function useExcluirEvento() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => requisitarSemResposta(`/api/calendario/eventos/${id}`, { metodo: 'DELETE' }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: chavesCalendario.todas }),
  })
}
