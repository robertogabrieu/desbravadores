import { LinkPublico, permissoesEfetivas } from '@desbravadores/shared'
import type { Entrada, IdentidadeDaSubstituicao, Papel } from '@desbravadores/shared'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { z } from 'zod'
import { configurarCliente, entrarNoModoSubstituicao, requisitar, sairDoModoSubstituicao } from '../api/cliente'
import { useConexao } from '../offline'
import { definirConexao } from '../offline/conexao'
import { registrarSubstituicaoLocal } from '../offline/limpeza'
import { iniciarMotorDaSubstituicao, pararMotor } from '../offline/motor'
import { tempos } from '../offline/tempos'
import { registrarAgoraDoServidor } from '../substituicao/relogio'
import { ContextoDaSessao } from './useSessao'
import type { ContextoSessao, Eu, Vinculo } from './useSessao'

type EntradaDoLink = z.infer<typeof Entrada>
type Identidade = z.infer<typeof IdentidadeDaSubstituicao>

export interface ContextoSubstituicao {
  token: string
  identidade: Identidade
  /** A API respondeu `SUBSTITUICAO_ENCERRADA`: o link foi cancelado ou saiu do prazo. */
  encerrada: boolean
}

const ContextoDaSubstituicao = createContext<ContextoSubstituicao | null>(null)

/** Dados do link aberto nesta árvore; nulo fora do `ProvedorSessaoSubstituto` (o app da conta). */
export const useSubstituicao = (): ContextoSubstituicao | null => useContext(ContextoDaSubstituicao)

/**
 * A identidade local é o id da substituição, como usuário e como vínculo: fila, pacote e rascunhos são
 * chaveados por eles, e o motor da conta do membro nunca pega o que é do link.
 */
function montarEu(identidade: Identidade): Eu {
  const papel: Papel = identidade.tipo === 'CHAMADA' ? 'CONSELHEIRO' : 'INSTRUTOR'
  const alvo = { id: identidade.alvoId, nome: identidade.alvoNome }
  const vinculo: Vinculo = {
    id: identidade.substituicaoId,
    papel,
    // A Entrada só traz o id do clube; as telas do link não mostram nome nem slug.
    clube: { id: identidade.clubeId, nome: '', slug: '' },
    unidades: identidade.tipo === 'CHAMADA' ? [alvo] : [],
    // Tipo, trilha e cor não vêm na Entrada; o que a tela do link usa da classe é o id e o nome.
    classes: identidade.tipo === 'CLASSE' ? [{ ...alvo, tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: '' }] : [],
  }
  return {
    usuario: { id: identidade.substituicaoId, nome: identidade.nome, email: '', genero: null },
    vinculoAtivo: vinculo,
    vinculos: [vinculo],
    permissoes: permissoesEfetivas(papel, []),
  }
}

const semEfeito = (): Promise<void> => Promise.resolve()

/**
 * Sessão da tela do link (`/substituto/:token`): sobrescreve a da conta para a árvore de dentro, fala com
 * a credencial do link, cuida da própria conexão e roda a fila sob a trava `fila:<id da substituição>`.
 * Nunca grava a identidade no aparelho: o app do membro reabriria como substituto.
 */
export function ProvedorSessaoSubstituto({ entrada, token, children }: { entrada: EntradaDoLink; token: string; children: ReactNode }) {
  const clienteConsultas = useQueryClient()
  const [encerrada, definirEncerrada] = useState(false)
  const { modo } = useConexao()
  const { identidade, credencial, agora } = entrada
  const substituicaoId = identidade.substituicaoId
  const fimEnvioEm = identidade.fimEnvioEm

  // Efeito de layout roda antes dos efeitos dos filhos: a primeira consulta da tela já sai com a credencial.
  useLayoutEffect(() => {
    entrarNoModoSubstituicao(credencial, () => definirEncerrada(true))
    configurarCliente({ aoFalhaDeRede: () => definirConexao('SEM_CONEXAO') })
    return () => {
      configurarCliente({ aoFalhaDeRede: () => undefined })
      sairDoModoSubstituicao()
    }
  }, [credencial])

  useLayoutEffect(() => {
    registrarAgoraDoServidor(agora)
  }, [agora])

  useEffect(() => {
    registrarSubstituicaoLocal({ id: substituicaoId, fimEnvioEm })
  }, [substituicaoId, fimEnvioEm])

  useEffect(() => {
    iniciarMotorDaSubstituicao({ usuarioId: substituicaoId, vinculoId: substituicaoId, queryClient: clienteConsultas })
    return () => {
      void pararMotor()
    }
  }, [substituicaoId, clienteConsultas])

  // O navegador avisar que caiu já vale como sem conexão; quem confirma a volta é a sondagem do link.
  useEffect(() => {
    const aoCairInternet = () => definirConexao('SEM_CONEXAO')
    window.addEventListener('offline', aoCairInternet)
    return () => window.removeEventListener('offline', aoCairInternet)
  }, [])

  // Sem conexão: sonda o link a cada evento `online` e a cada intervalo com a aba visível.
  useEffect(() => {
    if (modo !== 'SEM_CONEXAO') return
    let emTentativa = false
    const sondar = async () => {
      if (emTentativa) return
      emTentativa = true
      try {
        const link = await requisitar(`/api/auth/substituicao/${encodeURIComponent(token)}`, LinkPublico)
        registrarAgoraDoServidor(link.agora)
        definirConexao('ONLINE')
      } catch {
        // Ainda sem resposta da API: a próxima sondagem tenta de novo.
      } finally {
        emTentativa = false
      }
    }
    const aoVoltarInternet = () => void sondar()
    window.addEventListener('online', aoVoltarInternet)
    const intervalo = setInterval(() => {
      if (document.visibilityState === 'visible') void sondar()
    }, tempos.recuperacaoMs)
    return () => {
      window.removeEventListener('online', aoVoltarInternet)
      clearInterval(intervalo)
    }
  }, [modo, token])

  const eu = useMemo(() => montarEu(identidade), [identidade])

  const sessao = useMemo<ContextoSessao>(() => {
    const permissoes = new Set(eu.permissoes)
    return {
      situacao: 'autenticada',
      eu,
      vinculoAtivo: eu.vinculoAtivo,
      papel: eu.vinculoAtivo?.papel ?? null,
      vinculos: eu.vinculos,
      pode: (permissao) => permissoes.has(permissao),
      entrar: semEfeito,
      escolherPapel: semEfeito,
      sair: semEfeito,
      sairDeTodos: semEfeito,
      reabrir: semEfeito,
      relerSessao: () => Promise.resolve(eu),
      avisoDeSaida: null,
      dispensarAvisoDeSaida: () => undefined,
    }
  }, [eu])

  const substituicao = useMemo<ContextoSubstituicao>(() => ({ token, identidade, encerrada }), [token, identidade, encerrada])

  return (
    <ContextoDaSessao.Provider value={sessao}>
      <ContextoDaSubstituicao.Provider value={substituicao}>{children}</ContextoDaSubstituicao.Provider>
    </ContextoDaSessao.Provider>
  )
}
