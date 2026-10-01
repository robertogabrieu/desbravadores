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
import { limparDadosDoUsuario, useConexao } from '../offline'
import { definirConexao, definirExpirada } from '../offline/conexao'
import { estadoOffline } from '../offline/estado'
import { gravarIdentidade, lerUltimaIdentidade, tocarContato } from '../offline/identidade'
import type { RegistroSessao } from '../offline/banco'
import { limparFilaDeAbertura } from '../offline/limpeza'
import { iniciarMotor, liberarTrocaDePapel, pararMotor, pausarParaTrocaDePapel } from '../offline/motor'
import { baixarPacoteAoVoltarConexao, baixarPacoteSeVelho } from '../offline/pacote'
import { VALIDADE_DO_MODO_SEM_CONEXAO_MS, tempos } from '../offline/tempos'
import { avisarTrocaDePapel, ouvirOutrasAbas } from './abasDaSessao'
import { ContextoDaSessao } from './useSessao'
import type { ContextoSessao, Eu } from './useSessao'
import type { z } from 'zod'

type EstadoSessao =
  | { situacao: 'carregando' | 'anonima' | 'sem-conexao'; eu: null }
  | { situacao: 'autenticada'; eu: Eu }

const ESTADO_ANONIMO: EstadoSessao = { situacao: 'anonima', eu: null }
const ESTADO_SEM_CONEXAO: EstadoSessao = { situacao: 'sem-conexao', eu: null }
const INTERVALO_DO_CONTATO_MS = 60_000

type ResultadoDaTentativa = { tipo: 'ok'; eu: Eu } | { tipo: 'sem-rede' } | { tipo: 'recusa' }

/** Refresh + /api/eu, classificados pela regra E4: rede e servidor abrem sem conexão, recusa vai ao login. */
async function tentarAbrir(): Promise<ResultadoDaTentativa> {
  try {
    await renovarSessao()
    const eu = await requisitar('/api/eu', EuSaida)
    return { tipo: 'ok', eu }
  } catch (erro) {
    if (erro instanceof ErroDaApi) return erro.classe === 'RECUSA' ? { tipo: 'recusa' } : { tipo: 'sem-rede' }
    throw erro
  }
}

const esperar = (ms: number): Promise<void> => new Promise((resolver) => setTimeout(resolver, ms))

const identidadeVale = (guardada: RegistroSessao | null): guardada is RegistroSessao =>
  guardada !== null && Date.now() - guardada.ultimoContatoEm < VALIDADE_DO_MODO_SEM_CONEXAO_MS

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const clienteConsultas = useQueryClient()
  const [estado, definirEstado] = useState<EstadoSessao>({ situacao: 'carregando', eu: null })
  const { modo } = useConexao()
  // Ignora respostas de uma leitura antiga quando outra mais nova já começou (StrictMode, sair no meio).
  const geracao = useRef(0)
  const estadoAtual = useRef(estado)
  estadoAtual.current = estado
  const ultimoContato = useRef(0)

  const usuarioId = estado.eu?.usuario.id
  const vinculoId = estado.eu?.vinculoAtivo?.id

  /** Guarda a identidade e baixa o pacote: na abertura só se venceu (15 min), ao voltar a conexão sempre. */
  const aplicarEuOnline = useCallback((eu: Eu, aoVoltarConexao = false) => {
    definirConexao('ONLINE')
    definirExpirada(false)
    definirEstado({ situacao: 'autenticada', eu })
    void gravarIdentidade(eu).catch(() => undefined)
    if (!eu.vinculoAtivo) return
    if (aoVoltarConexao) void baixarPacoteAoVoltarConexao(eu.usuario.id, eu.vinculoAtivo.id)
    else void baixarPacoteSeVelho(eu.usuario.id, eu.vinculoAtivo.id)
  }, [])

  const lerEu = useCallback(async () => {
    const eu = await requisitar('/api/eu', EuSaida)
    aplicarEuOnline(eu)
  }, [aplicarEuOnline])

  const descartarSessao = useCallback(() => {
    geracao.current += 1
    definirTokenAcesso(null)
    estadoOffline.trocaParaVinculo = null
    clienteConsultas.clear()
    definirConexao('ONLINE')
    definirExpirada(false)
    definirEstado(ESTADO_ANONIMO)
  }, [clienteConsultas])

  const abrirSessao = useCallback(
    async (comNovaTentativa: boolean) => {
      const minha = ++geracao.current
      try {
        const limpeza = await limparFilaDeAbertura().catch(() => ({ descartadosDeOutraPessoa: 0 }))
        estadoOffline.descartadosDeOutraPessoa = limpeza.descartadosDeOutraPessoa
        const guardada = await lerUltimaIdentidade().catch(() => null)

        let resultado = await tentarAbrir()
        if (resultado.tipo === 'sem-rede' && comNovaTentativa) {
          await esperar(tempos.novaTentativaAberturaMs)
          if (minha !== geracao.current) return
          resultado = await tentarAbrir()
        }
        if (minha !== geracao.current) return

        if (resultado.tipo === 'ok') {
          aplicarEuOnline(resultado.eu)
        } else if (resultado.tipo === 'sem-rede') {
          if (identidadeVale(guardada)) {
            definirConexao('SEM_CONEXAO')
            definirEstado({ situacao: 'autenticada', eu: guardada.eu })
          } else {
            definirEstado(ESTADO_SEM_CONEXAO)
          }
        } else {
          if (guardada) await limparDadosDoUsuario(guardada.usuarioId, { manterFila: true }).catch(() => undefined)
          if (minha !== geracao.current) return
          definirTokenAcesso(null)
          definirEstado(ESTADO_ANONIMO)
        }
      } catch (erro) {
        if (minha !== geracao.current) return
        // O boot sempre termina: erro inesperado também vira anônimo (a guarda leva a /login).
        console.error('Falha inesperada ao abrir a sessão', erro)
        definirTokenAcesso(null)
        definirEstado(ESTADO_ANONIMO)
      }
    },
    [aplicarEuOnline],
  )

  useEffect(() => {
    configurarCliente({
      // Refresh recusado durante o uso: a pessoa segue na tela (pode salvar); ir ao login é escolha dela.
      aoSessaoPerdida: () => definirExpirada(true),
      aoVinculoInativo: () => void lerEu().catch(descartarSessao),
      aoFalhaDeRede: () => {
        if (estadoAtual.current.situacao === 'autenticada') definirConexao('SEM_CONEXAO')
      },
      aoContato: () => {
        const eu = estadoAtual.current.eu
        if (!eu || Date.now() - ultimoContato.current < INTERVALO_DO_CONTATO_MS) return
        ultimoContato.current = Date.now()
        void tocarContato(eu.usuario.id).catch(() => undefined)
      },
    })
    void abrirSessao(true)
  }, [abrirSessao, descartarSessao, lerEu])

  useEffect(() => {
    if (usuarioId && vinculoId) iniciarMotor({ usuarioId, vinculoId, queryClient: clienteConsultas })
    else void pararMotor()
  }, [usuarioId, vinculoId, clienteConsultas])

  useEffect(
    () => () => {
      void pararMotor()
    },
    [],
  )

  // Outra aba trocou de papel: o cookie de refresh já é do vínculo novo. Renova aqui também, para o
  // motor desta aba (que pode ser o dono da fila) passar ao vínculo novo e a tela relê o eu.
  useEffect(
    () =>
      ouvirOutrasAbas((aviso) => {
        const usuario = estadoAtual.current.eu?.usuario.id
        if (estadoAtual.current.situacao !== 'autenticada' || !usuario) return
        // Como na troca feita aqui: a fila pausa antes de renovar, senão um item do papel antigo já
        // escolhido sairia com o token novo e seria recusado de vez. A pausa sai quando o motor recebe
        // o vínculo da sessão renovada; se a renovação falhar ou vier sem vínculo, sai na hora.
        pausarParaTrocaDePapel(aviso.vinculoId)
        void (async () => {
          const sessao = await renovarSessao()
          if (sessao.vinculoAtivoId) iniciarMotor({ usuarioId: usuario, vinculoId: sessao.vinculoAtivoId, queryClient: clienteConsultas })
          liberarTrocaDePapel()
          clienteConsultas.clear()
          await lerEu()
        })().catch(() => liberarTrocaDePapel())
      }),
    [clienteConsultas, lerEu],
  )

  // Sem conexão: tenta renovar a cada evento `online` e a cada intervalo com a aba visível.
  useEffect(() => {
    if (modo !== 'SEM_CONEXAO') return
    let emTentativa = false
    const tentar = async () => {
      if (emTentativa) return
      emTentativa = true
      try {
        const resultado = await tentarAbrir()
        if (resultado.tipo === 'ok') {
          aplicarEuOnline(resultado.eu, true)
          const vinculo = resultado.eu.vinculoAtivo
          if (vinculo) iniciarMotor({ usuarioId: resultado.eu.usuario.id, vinculoId: vinculo.id, queryClient: clienteConsultas })
        } else if (resultado.tipo === 'recusa') {
          definirExpirada(true)
        }
      } catch (erro) {
        console.error('Falha inesperada ao renovar a sessão', erro)
      } finally {
        emTentativa = false
      }
    }
    const aoVoltarInternet = () => void tentar()
    window.addEventListener('online', aoVoltarInternet)
    const intervalo = setInterval(() => {
      if (document.visibilityState === 'visible') void tentar()
    }, tempos.recuperacaoMs)
    return () => {
      window.removeEventListener('online', aoVoltarInternet)
      clearInterval(intervalo)
    }
  }, [modo, aplicarEuOnline, clienteConsultas])

  // O navegador avisar que caiu já vale como sem conexão; quem confirma a volta é a API (efeito acima).
  useEffect(() => {
    const aoCairInternet = () => {
      if (estadoAtual.current.situacao === 'autenticada') definirConexao('SEM_CONEXAO')
    }
    window.addEventListener('offline', aoCairInternet)
    return () => window.removeEventListener('offline', aoCairInternet)
  }, [])

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
      // A fila não envia durante a troca: um item do papel antigo sairia com o token do novo e seria
      // recusado de vez. Aceita a troca, o motor passa na hora à sessão do vínculo novo (o que tira a
      // pausa, inclusive quando o papel escolhido é o que já estava em uso); recusada, volta como estava.
      pausarParaTrocaDePapel(vinculoId)
      let sessao
      try {
        sessao = await requisitar('/api/auth/papel-ativo', SessaoSaida, { metodo: 'POST', corpo: entrada })
      } catch (falha) {
        liberarTrocaDePapel()
        throw falha
      }
      definirTokenAcesso(sessao.accessToken)
      const usuario = estadoAtual.current.eu?.usuario.id
      if (usuario) iniciarMotor({ usuarioId: usuario, vinculoId, queryClient: clienteConsultas })
      avisarTrocaDePapel(vinculoId)
      clienteConsultas.clear()
      await lerEu()
    },
    [clienteConsultas, lerEu],
  )

  /** Encerra a sessão neste aparelho: apaga pacote, identidade e rascunhos, mas deixa a fila subir depois. */
  const encerrar = useCallback(
    async (chamarApi: () => Promise<void>) => {
      const dono = estadoAtual.current.eu?.usuario.id
      try {
        await chamarApi()
      } catch (erro) {
        // Sem internet o logout não chega, mas o aparelho precisa sair do mesmo jeito.
        if (!(erro instanceof ErroDaApi) || erro.classe === 'RECUSA') throw erro
      } finally {
        try {
          if (dono) await limparDadosDoUsuario(dono, { manterFila: true })
        } finally {
          descartarSessao()
        }
      }
    },
    [descartarSessao],
  )

  const sair = useCallback(
    () => encerrar(() => requisitarSemResposta('/api/auth/logout', { metodo: 'POST' })),
    [encerrar],
  )

  const sairDeTodos = useCallback(
    () => encerrar(() => requisitarSemResposta('/api/auth/sair-de-todos', { metodo: 'POST' })),
    [encerrar],
  )

  const reabrir = useCallback(() => abrirSessao(false), [abrirSessao])

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
      reabrir,
    }
  }, [estado, entrar, escolherPapel, sair, sairDeTodos, reabrir])

  return <ContextoDaSessao.Provider value={valor}>{children}</ContextoDaSessao.Provider>
}
