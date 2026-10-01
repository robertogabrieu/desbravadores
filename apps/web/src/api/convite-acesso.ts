import {
  AceitarConviteAcessoEntrada,
  ConviteAcessoEntrada,
  ConviteAcessoGeradoSaida,
  ConviteAcessoSaida,
  ConvitePublicoSaida,
  SessaoSaida,
  SituacaoAcessoSaida,
} from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { requisitar, requisitarSemResposta } from './cliente'

export type ConviteAcesso = z.infer<typeof ConviteAcessoSaida>
export type SituacaoAcesso = z.infer<typeof SituacaoAcessoSaida>
export type ConvitePublico = z.infer<typeof ConvitePublicoSaida>
export type NovoConviteAcesso = z.output<typeof ConviteAcessoEntrada>

const chaveSituacao = (dbvId: string) => ['convite-acesso', dbvId] as const
const caminho = (dbvId: string) => `/api/desbravadores/${dbvId}/convite-acesso`

export function useSituacaoAcesso(dbvId: string) {
  return useQuery({ queryKey: chaveSituacao(dbvId), queryFn: () => requisitar(caminho(dbvId), SituacaoAcessoSaida) })
}

/** O link só existe na resposta de quem gerou: ele fica no cache enquanto o painel estiver aberto. */
export function useGerarConviteAcesso(dbvId: string) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (entrada: NovoConviteAcesso) =>
      requisitar(caminho(dbvId), ConviteAcessoGeradoSaida, { metodo: 'POST', corpo: entrada }),
    onSuccess: (convite) => cliente.setQueryData<SituacaoAcesso>(chaveSituacao(dbvId), { convite, conta: null }),
  })
}

export function useCancelarConviteAcesso(dbvId: string) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: () => requisitarSemResposta(caminho(dbvId), { metodo: 'DELETE' }),
    onSuccess: () => cliente.setQueryData<SituacaoAcesso>(chaveSituacao(dbvId), { convite: null, conta: null }),
  })
}

export function useConvitePublico(token: string) {
  return useQuery({
    queryKey: ['convite-acesso-publico', token],
    queryFn: () => requisitar(`/api/acesso/${encodeURIComponent(token)}`, ConvitePublicoSaida),
  })
}

export function useAceitarConviteAcesso(token: string) {
  return useMutation({
    mutationFn: (entrada: z.output<typeof AceitarConviteAcessoEntrada>) =>
      requisitar(`/api/acesso/${encodeURIComponent(token)}`, SessaoSaida, { metodo: 'POST', corpo: entrada }),
  })
}
