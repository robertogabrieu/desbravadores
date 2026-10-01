import { CalendarioSaida, EventoEntrada, EventoGravadoSaida, EventoSaida } from '@desbravadores/shared'
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
  evento: (id: string) => ['calendario', 'evento', id] as const,
}

/** Eventos que tocam o ano civil e os dias de reunião que sobram deles. */
export function useCalendario(ano: number) {
  return useQuery({
    queryKey: chavesCalendario.ano(ano),
    queryFn: () => requisitar(`/api/calendario?ano=${ano}`, CalendarioSaida),
  })
}

/** `habilitada: false` não consulta (a tela de evento novo não tem id). */
export function useEvento(id: string, habilitada = true) {
  return useQuery({
    queryKey: chavesCalendario.evento(id),
    queryFn: () => requisitar(`/api/calendario/eventos/${id}`, EventoSaida),
    enabled: habilitada,
  })
}

export function useCriarEvento() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (entrada: NovoEvento) =>
      requisitar('/api/calendario/eventos', EventoGravadoSaida, { metodo: 'POST', corpo: EventoEntrada.parse(entrada) }),
    onSuccess: (gravado) => {
      cliente.setQueryData(chavesCalendario.evento(gravado.evento.id), gravado.evento)
      return cliente.invalidateQueries({ queryKey: chavesCalendario.todas })
    },
  })
}

export function useEditarEvento() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: ({ id, entrada }: { id: string; entrada: NovoEvento }) =>
      requisitar(`/api/calendario/eventos/${id}`, EventoGravadoSaida, { metodo: 'PATCH', corpo: EventoEntrada.parse(entrada) }),
    onSuccess: (gravado) => {
      cliente.setQueryData(chavesCalendario.evento(gravado.evento.id), gravado.evento)
      return cliente.invalidateQueries({ queryKey: chavesCalendario.todas })
    },
  })
}

export function useExcluirEvento() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => requisitarSemResposta(`/api/calendario/eventos/${id}`, { metodo: 'DELETE' }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: chavesCalendario.todas }),
  })
}
