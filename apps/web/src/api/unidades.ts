import { UnidadeCriarEntrada, UnidadeEditarEntrada, UnidadeSaida } from '@desbravadores/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { requisitar } from './cliente'
import { chavesLeitura } from './leitura'

export type NovaUnidade = z.input<typeof UnidadeCriarEntrada>
export type EdicaoUnidade = z.input<typeof UnidadeEditarEntrada>

/** Unidades, membros e "sem unidade" partilham a raiz da chave; uma invalidação cobre os três. */
export function invalidarUnidades(cliente: QueryClient): Promise<void> {
  const [raiz] = chavesLeitura.semMembros
  return cliente.invalidateQueries({ queryKey: [raiz] })
}

export function useCriarUnidade() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (entrada: NovaUnidade) =>
      requisitar('/api/unidades', UnidadeSaida, { metodo: 'POST', corpo: UnidadeCriarEntrada.parse(entrada) }),
    onSuccess: () => invalidarUnidades(cliente),
  })
}

export function useEditarUnidade() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: ({ id, entrada }: { id: string; entrada: EdicaoUnidade }) =>
      requisitar(`/api/unidades/${id}`, UnidadeSaida, { metodo: 'PATCH', corpo: UnidadeEditarEntrada.parse(entrada) }),
    onSuccess: () => invalidarUnidades(cliente),
  })
}
