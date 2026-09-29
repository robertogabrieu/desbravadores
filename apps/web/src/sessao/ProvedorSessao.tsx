import { EuSaida, PapelAtivoEntrada, SessaoSaida } from '@desbravadores/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ErroDaApi,
  configurarCliente,
  definirTokenAcesso,
  renovarSessao,
  requisitar,
  requisitarSemResposta,
} from '../api/cliente'
import type { Sessao } from '../api/cliente'
import { ContextoDaSessao } from './useSessao'
import type { ContextoSessao, Eu } from './useSessao'
import type { z } from 'zod'

type EstadoSessao = { situacao: 'carregando' | 'anonima'; eu: null } | { situacao: 'autenticada'; eu: Eu }

const ESTADO_ANONIMO: EstadoSessao = { situacao: 'anonima', eu: null }

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const clienteConsultas = useQueryClient()
  const [estado, definirEstado] = useState<EstadoSessao>({ situacao: 'carregando', eu: null })
  // Ignora respostas de uma leitura antiga quando outra mais nova já começou (StrictMode, sair no meio).
  const geracao = useRef(0)

  const lerEu = useCallback(async () => {
    const eu = await requisitar('/api/eu', EuSaida)
    definirEstado({ situacao: 'autenticada', eu })
  }, [])

  const descartarSessao = useCallback(() => {
    geracao.current += 1
    definirTokenAcesso(null)
    clienteConsultas.clear()
    definirEstado(ESTADO_ANONIMO)
  }, [clienteConsultas])

  const abrirSessao = useCallback(async () => {
    const minha = ++geracao.current
    try {
      await renovarSessao()
      const eu = await requisitar('/api/eu', EuSaida)
      if (minha === geracao.current) definirEstado({ situacao: 'autenticada', eu })
    } catch (erro) {
      if (minha !== geracao.current) return
      // O boot sempre termina: erro inesperado também vira anônimo (a guarda leva a /login).
      if (!(erro instanceof ErroDaApi)) console.error('Falha inesperada ao abrir a sessão', erro)
      definirTokenAcesso(null)
      definirEstado(ESTADO_ANONIMO)
    }
  }, [])

  useEffect(() => {
    configurarCliente({
      aoSessaoPerdida: descartarSessao,
      aoVinculoInativo: () => void lerEu().catch(descartarSessao),
    })
    void abrirSessao()
  }, [abrirSessao, descartarSessao, lerEu])

  const entrar = useCallback(
    async (sessao: Sessao) => {
      definirTokenAcesso(sessao.accessToken)
      await lerEu()
    },
    [lerEu],
  )

  const escolherPapel = useCallback(
    async (vinculoId: string) => {
      const entrada: z.infer<typeof PapelAtivoEntrada> = { vinculoId }
      const sessao = await requisitar('/api/auth/papel-ativo', SessaoSaida, { metodo: 'POST', corpo: entrada })
      definirTokenAcesso(sessao.accessToken)
      clienteConsultas.clear()
      await lerEu()
    },
    [clienteConsultas, lerEu],
  )

  const sair = useCallback(async () => {
    try {
      await requisitarSemResposta('/api/auth/logout', { metodo: 'POST' })
    } finally {
      descartarSessao()
    }
  }, [descartarSessao])

  const sairDeTodos = useCallback(async () => {
    try {
      await requisitarSemResposta('/api/auth/sair-de-todos', { metodo: 'POST' })
    } finally {
      descartarSessao()
    }
  }, [descartarSessao])

  const valor = useMemo<ContextoSessao>(() => {
    const eu = estado.eu
    const permissoes = new Set(eu?.permissoes ?? [])
    return {
      situacao: estado.situacao,
      eu,
      vinculoAtivo: eu?.vinculoAtivo ?? null,
      papel: eu?.vinculoAtivo?.papel ?? null,
      vinculos: eu?.vinculos ?? [],
      pode: (permissao) => permissoes.has(permissao),
      entrar,
      escolherPapel,
      sair,
      sairDeTodos,
    }
  }, [estado, entrar, escolherPapel, sair, sairDeTodos])

  return <ContextoDaSessao.Provider value={valor}>{children}</ContextoDaSessao.Provider>
}
