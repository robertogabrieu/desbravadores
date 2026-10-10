import { DatasElegiveis, GerarSubstituicaoEntrada, SubstituicaoDoAlvo, SubstituicaoGerada, TipoSubstituicao } from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { montarConsulta, requisitar, requisitarSemResposta } from './cliente'

export type JanelaElegivel = z.infer<typeof DatasElegiveis>[number]
export type SubstituicaoAberta = NonNullable<z.infer<typeof SubstituicaoDoAlvo>>
export type SubstituicaoComLink = z.infer<typeof SubstituicaoGerada>
export type TipoDeSubstituicao = z.infer<typeof TipoSubstituicao>

/** Para quem o link é: a chamada de uma unidade ou o registro de uma classe. */
export interface AlvoDaSubstituicao {
  tipo: 'unidade' | 'classe'
  id: string
}

const caminho = ({ tipo, id }: AlvoDaSubstituicao) => `/api/${tipo === 'unidade' ? 'unidades' : 'classes'}/${id}/substituicao`
const chaveDoAlvo = ({ tipo, id }: AlvoDaSubstituicao) => ['substituicao', tipo, id] as const

export const tipoDoLink = (alvo: AlvoDaSubstituicao): TipoDeSubstituicao => (alvo.tipo === 'unidade' ? 'CHAMADA' : 'CLASSE')

export function useDatasDeSubstituicao(tipo: TipoDeSubstituicao) {
  return useQuery({
    queryKey: ['substituicao', 'datas', tipo],
    queryFn: () => requisitar(`/api/substituicoes/datas${montarConsulta({ tipo })}`, DatasElegiveis),
  })
}

export function useSubstituicaoDoAlvo(alvo: AlvoDaSubstituicao, habilitada = true) {
  return useQuery({
    queryKey: chaveDoAlvo(alvo),
    queryFn: () => requisitar(caminho(alvo), SubstituicaoDoAlvo),
    enabled: habilitada,
  })
}

/** O link só existe na resposta da geração: o cache do cartão guarda a substituição sem ele. */
export function useGerarSubstituicao(alvo: AlvoDaSubstituicao) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (entrada: z.input<typeof GerarSubstituicaoEntrada>) =>
      requisitar(caminho(alvo), SubstituicaoGerada, { metodo: 'POST', corpo: entrada }),
    onSuccess: ({ id, data, inicioEm, fimEm, identificadaEm, substituto }) =>
      cliente.setQueryData<SubstituicaoAberta | null>(chaveDoAlvo(alvo), { id, data, inicioEm, fimEm, identificadaEm, substituto }),
  })
}

export function useCancelarSubstituicao(alvo: AlvoDaSubstituicao) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: () => requisitarSemResposta(caminho(alvo), { metodo: 'DELETE' }),
    onSuccess: () => cliente.setQueryData<SubstituicaoAberta | null>(chaveDoAlvo(alvo), null),
  })
}
