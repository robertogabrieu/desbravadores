import { ProgressoClasseSaida, ProgressoDbvSaida } from '@desbravadores/shared'
import { useQuery } from '@tanstack/react-query'
import type { z } from 'zod'
import { requisitar } from './cliente'

export type ProgressoClasse = z.infer<typeof ProgressoClasseSaida>

/** A raiz `progresso` é invalidada pelo envio de aulas e pela marcação de requisitos. */
export const chavesProgresso = {
  classe: (classeId: string) => ['progresso', 'classe', classeId] as const,
  dbv: (dbvId: string) => ['progresso', 'dbv', dbvId] as const,
}

/** `habilitada: false` (sem conexão, ou sem classe escolhida) não consulta. */
export function useProgressoClasse(classeId: string, habilitada = true) {
  return useQuery({
    queryKey: chavesProgresso.classe(classeId),
    queryFn: () => requisitar(`/api/classes/${classeId}/progresso`, ProgressoClasseSaida),
    enabled: habilitada && classeId !== '',
  })
}

export function useProgressoDbv(dbvId: string) {
  return useQuery({
    queryKey: chavesProgresso.dbv(dbvId),
    queryFn: () => requisitar(`/api/desbravadores/${dbvId}/progresso`, ProgressoDbvSaida),
  })
}
