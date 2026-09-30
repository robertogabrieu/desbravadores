import { CronogramaLeitura } from '@desbravadores/shared'
import { useQuery } from '@tanstack/react-query'
import type { z } from 'zod'
import { requisitar } from './cliente'

export type Cronograma = z.infer<typeof CronogramaLeitura>
export type AulaDoCronograma = Cronograma['aulas'][number]

export const chavesCronograma = {
  leitura: (classeId: string) => ['cronograma', classeId] as const,
}

/** Leitura do cronograma de uma classe (o ano é o corrente do clube). */
export function useCronograma(classeId: string | undefined) {
  return useQuery({
    queryKey: chavesCronograma.leitura(classeId ?? ''),
    enabled: classeId !== undefined,
    queryFn: () => requisitar(`/api/classes/${classeId}/cronograma`, CronogramaLeitura),
  })
}
