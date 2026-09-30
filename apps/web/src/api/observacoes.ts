import { ObservacaoEditarEntrada, ObservacaoEntrada, ObservacaoSaida } from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { montarConsulta, requisitar, requisitarSemResposta } from './cliente'

export type Observacao = z.infer<typeof ObservacaoSaida>
export type NovaObservacao = z.input<typeof ObservacaoEntrada>
export type EdicaoObservacao = z.input<typeof ObservacaoEditarEntrada>
export type AlvoDaObservacao = Observacao['alvo']

const RAIZ = 'observacoes'

export const chavesObservacoes = {
  raiz: [RAIZ] as const,
  lista: (classeId: string, alvo: AlvoDaObservacao) => [RAIZ, classeId, alvo] as const,
}

/**
 * B12: o texto das observações não fica guardado no aparelho. Não há persistência do cache em disco;
 * `gcTime: 0` tira a consulta da memória assim que a tela sai (celular compartilhado), e `sair()` limpa o resto.
 */
export function useObservacoes(classeId: string, alvo: AlvoDaObservacao, habilitada = true) {
  return useQuery({
    queryKey: chavesObservacoes.lista(classeId, alvo),
    queryFn: () => requisitar(`/api/observacoes${montarConsulta({ classeId, alvo })}`, z.array(ObservacaoSaida)),
    enabled: habilitada && classeId !== '',
    gcTime: 0,
  })
}

export function useCriarObservacao() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: (entrada: NovaObservacao) => requisitar('/api/observacoes', ObservacaoSaida, { metodo: 'POST', corpo: entrada }),
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: chavesObservacoes.raiz }),
  })
}

export function useEditarObservacao() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: ({ id, ...corpo }: EdicaoObservacao & { id: string }) =>
      requisitar(`/api/observacoes/${id}`, ObservacaoSaida, { metodo: 'PATCH', corpo }),
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: chavesObservacoes.raiz }),
  })
}

export function useApagarObservacao() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: (id: string) => requisitarSemResposta(`/api/observacoes/${id}`, { metodo: 'DELETE' }),
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: chavesObservacoes.raiz }),
  })
}
