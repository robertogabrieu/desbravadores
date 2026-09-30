import { VisaoGeralSaida } from '@desbravadores/shared'
import { useQuery } from '@tanstack/react-query'
import type { z } from 'zod'
import { requisitar } from './cliente'

export type VisaoGeral = z.infer<typeof VisaoGeralSaida>

export const chavesVisaoGeral = { todas: ['visao-geral'] as const }

export function useVisaoGeral() {
  return useQuery({
    queryKey: chavesVisaoGeral.todas,
    queryFn: () => requisitar('/api/visao-geral', VisaoGeralSaida),
  })
}
