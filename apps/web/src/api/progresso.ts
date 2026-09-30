import { ProgressoClasseSaida, ProgressoDbvSaida } from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { requisitar } from './cliente'

export type ProgressoClasse = z.infer<typeof ProgressoClasseSaida>
export type ProgressoDbv = z.infer<typeof ProgressoDbvSaida>

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

interface AlvoDoRequisito {
  dbvId: string
  requisitoId: string
}

/** Invalida `progresso` e o perfil: a marcação muda o percentual e os pontos. */
function useInvalidarProgressoEPerfil() {
  const clienteConsultas = useQueryClient()
  return () =>
    Promise.all([
      clienteConsultas.invalidateQueries({ queryKey: ['progresso'] }),
      clienteConsultas.invalidateQueries({ queryKey: ['perfil'] }),
    ])
}

export function useMarcarRequisito() {
  const invalidar = useInvalidarProgressoEPerfil()
  return useMutation({
    networkMode: 'always',
    mutationFn: ({ dbvId, requisitoId, concluidoEm }: AlvoDoRequisito & { concluidoEm: string }) =>
      requisitar(`/api/desbravadores/${dbvId}/requisitos/${requisitoId}`, ProgressoDbvSaida, { metodo: 'PUT', corpo: { concluidoEm } }),
    onSuccess: invalidar,
  })
}

export function useDesmarcarRequisito() {
  const invalidar = useInvalidarProgressoEPerfil()
  return useMutation({
    networkMode: 'always',
    mutationFn: ({ dbvId, requisitoId }: AlvoDoRequisito) =>
      requisitar(`/api/desbravadores/${dbvId}/requisitos/${requisitoId}`, ProgressoDbvSaida, { metodo: 'DELETE' }),
    onSuccess: invalidar,
  })
}
