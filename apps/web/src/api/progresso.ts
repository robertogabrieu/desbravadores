import { ProgressoClasseSaida, ProgressoDbvSaida } from '@desbravadores/shared'
import { useQuery } from '@tanstack/react-query'
import { requisitar } from './cliente'

/** A raiz `progresso` é invalidada pelo envio de aulas e pela marcação de requisitos. */
export const chavesProgresso = {
  classe: (classeId: string) => ['progresso', 'classe', classeId] as const,
  dbv: (dbvId: string) => ['progresso', 'dbv', dbvId] as const,
}

export function useProgressoClasse(classeId: string) {
  return useQuery({
    queryKey: chavesProgresso.classe(classeId),
    queryFn: () => requisitar(`/api/classes/${classeId}/progresso`, ProgressoClasseSaida),
  })
}

export function useProgressoDbv(dbvId: string) {
  return useQuery({
    queryKey: chavesProgresso.dbv(dbvId),
    queryFn: () => requisitar(`/api/desbravadores/${dbvId}/progresso`, ProgressoDbvSaida),
  })
}
