import { UnidadeCriarEntrada, UnidadeEditarEntrada, UnidadeSaida } from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

/** Mesma raiz das listas: uma invalidação de `unidades` também atualiza a ficha. */
export const chaveUnidade = (id: string) => [chavesLeitura.semMembros[0], id] as const

export function useUnidade(id: string, habilitada = true) {
  return useQuery({
    queryKey: chaveUnidade(id),
    queryFn: () => requisitar(`/api/unidades/${id}`, UnidadeSaida),
    enabled: habilitada,
  })
}

/** A ficha aberta logo após gravar já mostra o que foi gravado, sem esperar a releitura. */
function guardarEInvalidar(cliente: QueryClient, unidade: z.infer<typeof UnidadeSaida>): Promise<void> {
  cliente.setQueryData(chaveUnidade(unidade.id), unidade)
  return invalidarUnidades(cliente)
}

export function useCriarUnidade() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (entrada: NovaUnidade) =>
      requisitar('/api/unidades', UnidadeSaida, { metodo: 'POST', corpo: UnidadeCriarEntrada.parse(entrada) }),
    onSuccess: (unidade) => guardarEInvalidar(cliente, unidade),
  })
}

export function useEditarUnidade() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: ({ id, entrada }: { id: string; entrada: EdicaoUnidade }) =>
      requisitar(`/api/unidades/${id}`, UnidadeSaida, { metodo: 'PATCH', corpo: UnidadeEditarEntrada.parse(entrada) }),
    onSuccess: (unidade) => guardarEInvalidar(cliente, unidade),
  })
}
