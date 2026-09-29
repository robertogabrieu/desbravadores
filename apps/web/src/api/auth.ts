import { AceitarConviteEntrada, EsqueciSenhaEntrada, LoginEntrada, RedefinirSenhaEntrada, SessaoSaida } from '@desbravadores/shared'
import { useMutation } from '@tanstack/react-query'
import type { z } from 'zod'
import { useSessao } from '../sessao/useSessao'
import { requisitar, requisitarSemResposta } from './cliente'

type Entrada<S extends z.ZodType> = z.output<S>

export function useLogin() {
  return useMutation({
    mutationFn: (entrada: Entrada<typeof LoginEntrada>) =>
      requisitar('/api/auth/login', SessaoSaida, { metodo: 'POST', corpo: entrada }),
  })
}

export function useAceitarConvite() {
  return useMutation({
    mutationFn: (entrada: Entrada<typeof AceitarConviteEntrada>) =>
      requisitar('/api/auth/convite/aceitar', SessaoSaida, { metodo: 'POST', corpo: entrada }),
  })
}

export function useEsqueciSenha() {
  return useMutation({
    mutationFn: (entrada: Entrada<typeof EsqueciSenhaEntrada>) =>
      requisitarSemResposta('/api/auth/senha/esqueci', { metodo: 'POST', corpo: entrada }),
  })
}

export function useRedefinirSenha() {
  return useMutation({
    mutationFn: (entrada: Entrada<typeof RedefinirSenhaEntrada>) =>
      requisitarSemResposta('/api/auth/senha/redefinir', { metodo: 'POST', corpo: entrada }),
  })
}

/** Troca o vínculo ativo: a sessão (token novo, /api/eu, cache) é atualizada por `escolherPapel`. */
export function usePapelAtivo() {
  const { escolherPapel } = useSessao()
  return useMutation({ mutationFn: (vinculoId: string) => escolherPapel(vinculoId) })
}
