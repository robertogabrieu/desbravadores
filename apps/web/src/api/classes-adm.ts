import {
  AreaComEspecialidades,
  ClasseDetalheSaida,
  type ClasseClubeEditarEntrada,
  type EspecialidadeClubeEntrada,
  type RequisitoAjusteEntrada,
} from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { requisitar } from './cliente'

export type ClasseDetalhe = z.infer<typeof ClasseDetalheSaida>
export type RequisitoDetalhe = ClasseDetalhe['secoes'][number]['requisitos'][number]
export type AreaEspecialidades = z.infer<typeof AreaComEspecialidades>
export type EdicaoDaClasse = z.infer<typeof ClasseClubeEditarEntrada>
export type AjusteDoRequisito = z.infer<typeof RequisitoAjusteEntrada>
export type NovaEspecialidade = z.infer<typeof EspecialidadeClubeEntrada>

/** O detalhe mora sob `classes`: invalidar `['classes']` atualiza a lista e o detalhe de uma vez. */
export const chavesClassesAdm = {
  detalhe: (id: string) => ['classes', 'detalhe', id] as const,
  especialidades: ['especialidades', 'adm'] as const,
}

export function useClasseDetalhe(id: string | undefined) {
  return useQuery({
    queryKey: chavesClassesAdm.detalhe(id ?? ''),
    queryFn: () => requisitar(`/api/classes/${id ?? ''}`, ClasseDetalheSaida),
    enabled: id !== undefined,
  })
}

export function useEditarClasse() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    mutationFn: ({ id, entrada }: { id: string; entrada: EdicaoDaClasse }) =>
      requisitar(`/api/classes/${id}`, ClasseDetalheSaida, { metodo: 'PATCH', corpo: entrada }),
    onSettled: () => clienteConsultas.invalidateQueries({ queryKey: ['classes'] }),
  })
}

export function useAjustarRequisito() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    mutationFn: ({ id, entrada }: { id: string; entrada: AjusteDoRequisito }) =>
      requisitar(`/api/requisitos/${id}/ajuste`, ClasseDetalheSaida, { metodo: 'PATCH', corpo: entrada }),
    onSettled: () => clienteConsultas.invalidateQueries({ queryKey: ['classes'] }),
  })
}

export function useEspecialidades() {
  return useQuery({
    queryKey: chavesClassesAdm.especialidades,
    queryFn: () => requisitar('/api/especialidades', z.array(AreaComEspecialidades)),
  })
}

export function useCriarEspecialidade() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    mutationFn: (entrada: NovaEspecialidade) =>
      requisitar('/api/especialidades', z.array(AreaComEspecialidades), { metodo: 'POST', corpo: entrada }),
    onSettled: () => clienteConsultas.invalidateQueries({ queryKey: ['especialidades'] }),
  })
}
