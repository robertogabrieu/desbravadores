import {
  PasskeyCadastroEntrada,
  PasskeyCadastroOpcoesEntrada,
  PasskeyCadastroOpcoesSaida,
  PasskeyListaSaida,
  PasskeyLoginEntrada,
  PasskeyLoginOpcoesSaida,
  PasskeyResumo,
  SessaoSaida,
} from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { requisitar, requisitarSemResposta } from './cliente'

type Entrada<S extends z.ZodType> = z.output<S>

export type Passkey = z.infer<typeof PasskeyResumo>

const chavePasskeys = ['passkeys'] as const

export function useOpcoesLoginPasskey() {
  return useMutation({
    mutationFn: () => requisitar('/api/auth/passkey/login/opcoes', PasskeyLoginOpcoesSaida, { metodo: 'POST' }),
  })
}

export function useLoginPasskey() {
  return useMutation({
    mutationFn: (entrada: Entrada<typeof PasskeyLoginEntrada>) =>
      requisitar('/api/auth/passkey/login', SessaoSaida, { metodo: 'POST', corpo: entrada }),
  })
}

/** Só lê a lista onde o aparelho entende passkey: `habilitada` evita uma chamada que não serviria a ninguém. */
export function usePasskeys(habilitada: boolean) {
  return useQuery({
    queryKey: chavePasskeys,
    queryFn: () => requisitar('/api/eu/passkeys', PasskeyListaSaida),
    enabled: habilitada,
  })
}

export function useOpcoesCadastroPasskey() {
  return useMutation({
    mutationFn: (entrada: Entrada<typeof PasskeyCadastroOpcoesEntrada>) =>
      requisitar('/api/eu/passkeys/opcoes', PasskeyCadastroOpcoesSaida, { metodo: 'POST', corpo: entrada }),
  })
}

export function useCadastrarPasskey() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (entrada: Entrada<typeof PasskeyCadastroEntrada>) =>
      requisitar('/api/eu/passkeys', PasskeyResumo, { metodo: 'POST', corpo: entrada }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: chavePasskeys }),
  })
}

export function useRemoverPasskey() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => requisitarSemResposta(`/api/eu/passkeys/${id}`, { metodo: 'DELETE' }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: chavePasskeys }),
  })
}
