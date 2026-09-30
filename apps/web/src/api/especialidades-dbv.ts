import { AreaComEspecialidades, EspecialidadesDoDbvSaida } from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { requisitar } from './cliente'
import { chavesPerfil } from './perfil'

export type AreaEspecialidades = z.infer<typeof AreaComEspecialidades>
export type EspecialidadesDoDbv = z.infer<typeof EspecialidadesDoDbvSaida>

export const chavesEspecialidades = {
  catalogo: ['especialidades', 'catalogo'] as const,
  doDbv: (dbvId: string) => ['especialidades', 'dbv', dbvId] as const,
}

/** `habilitada: false` (sem conexão) não consulta: as especialidades não ficam guardadas no aparelho. */
export function useCatalogoEspecialidades(habilitada = true) {
  return useQuery({
    queryKey: chavesEspecialidades.catalogo,
    queryFn: () => requisitar('/api/especialidades', z.array(AreaComEspecialidades)),
    enabled: habilitada,
    staleTime: 5 * 60_000,
  })
}

export function useEspecialidadesDoDbv(dbvId: string | undefined, habilitada = true) {
  return useQuery({
    queryKey: chavesEspecialidades.doDbv(dbvId ?? ''),
    queryFn: () => requisitar(`/api/desbravadores/${dbvId ?? ''}/especialidades`, EspecialidadesDoDbvSaida),
    enabled: habilitada && dbvId !== undefined,
  })
}

interface EntradaMarcar {
  especialidadeId: string
  concluidoEm: string
}

/** Marcar e desmarcar devolvem a lista atualizada: ela substitui a do cache. */
export function useMarcarEspecialidade(dbvId: string) {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: ({ especialidadeId, concluidoEm }: EntradaMarcar) =>
      requisitar(`/api/desbravadores/${dbvId}/especialidades/${especialidadeId}`, EspecialidadesDoDbvSaida, {
        metodo: 'PUT',
        corpo: { concluidoEm },
      }),
    onSuccess: (saida) => {
      clienteConsultas.setQueryData(chavesEspecialidades.doDbv(dbvId), saida)
      void clienteConsultas.invalidateQueries({ queryKey: ['ranking'] })
      void clienteConsultas.invalidateQueries({ queryKey: ['progresso'] })
      void clienteConsultas.invalidateQueries({ queryKey: chavesPerfil.dbv(dbvId) })
    },
  })
}

export function useDesmarcarEspecialidade(dbvId: string) {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: (especialidadeId: string) =>
      requisitar(`/api/desbravadores/${dbvId}/especialidades/${especialidadeId}`, EspecialidadesDoDbvSaida, { metodo: 'DELETE' }),
    onSuccess: (saida) => {
      clienteConsultas.setQueryData(chavesEspecialidades.doDbv(dbvId), saida)
      void clienteConsultas.invalidateQueries({ queryKey: ['ranking'] })
      void clienteConsultas.invalidateQueries({ queryKey: ['progresso'] })
      void clienteConsultas.invalidateQueries({ queryKey: chavesPerfil.dbv(dbvId) })
    },
  })
}
