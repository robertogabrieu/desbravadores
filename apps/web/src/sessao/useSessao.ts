import type { EuSaida, Papel } from '@desbravadores/shared'
import { createContext, useContext } from 'react'
import type { z } from 'zod'
import type { Sessao } from '../api/cliente'

export type Eu = z.infer<typeof EuSaida>
export type Vinculo = Eu['vinculos'][number]

export interface ContextoSessao {
  /** `carregando` só até a primeira resposta de refresh + /api/eu. `sem-conexao`: abriu sem internet e sem identidade guardada válida (rota /conectar). */
  situacao: 'carregando' | 'anonima' | 'sem-conexao' | 'autenticada'
  eu: Eu | null
  /** Vínculo ativo; nulo quando o usuário ainda não escolheu (rota /papel). */
  vinculoAtivo: Vinculo | null
  papel: Papel | null
  vinculos: Vinculo[]
  pode: (permissao: string) => boolean
  /** Depois de login/convite: guarda o token da sessão recebida e lê /api/eu. */
  entrar: (sessao: Sessao) => Promise<void>
  escolherPapel: (vinculoId: string) => Promise<void>
  sair: () => Promise<void>
  sairDeTodos: () => Promise<void>
  /** Repete a abertura sem a espera de 5 s (botão "Tentar de novo" da rota /conectar). */
  reabrir: () => Promise<void>
}

export const ContextoDaSessao = createContext<ContextoSessao | null>(null)

export function useSessao(): ContextoSessao {
  const contexto = useContext(ContextoDaSessao)
  if (!contexto) throw new Error('useSessao fora do ProvedorSessao')
  return contexto
}
