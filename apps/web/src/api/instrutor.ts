import { InicioInstrutorSaida } from '@desbravadores/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { z } from 'zod'
import { requisitar, requisitarSemResposta } from './cliente'

export type InicioInstrutor = z.infer<typeof InicioInstrutorSaida>
export type ClasseDoInstrutor = InicioInstrutor['classes'][number]

/** A raiz `inicio` é invalidada pelo envio de aulas e chamadas. */
export const chavesInstrutor = {
  inicio: ['inicio', 'instrutor'] as const,
}

export function useInicioInstrutor() {
  return useQuery({
    queryKey: chavesInstrutor.inicio,
    queryFn: () => requisitar('/api/inicio/instrutor', InicioInstrutorSaida),
  })
}

/** "Pedir para eu montar": a API notifica os Adms (204, também na repetição em 24 h). */
export function usePedirLiberacao() {
  return useMutation({
    mutationFn: (classeId: string) => requisitarSemResposta(`/api/classes/${classeId}/pedir-liberacao`, { metodo: 'POST' }),
  })
}
