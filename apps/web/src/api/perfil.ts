import { PerfilDbvSaida } from '@desbravadores/shared'
import { useQuery } from '@tanstack/react-query'
import type { z } from 'zod'
import { requisitar } from './cliente'

export type PerfilDbv = z.infer<typeof PerfilDbvSaida>

export const chavesPerfil = {
  dbv: (id: string) => ['perfil', id] as const,
}

export function usePerfilDbv(id: string) {
  return useQuery({
    queryKey: chavesPerfil.dbv(id),
    queryFn: () => requisitar(`/api/desbravadores/${id}/perfil`, PerfilDbvSaida),
  })
}
