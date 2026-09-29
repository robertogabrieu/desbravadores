import { ErroApi as EsquemaErroApi, SessaoSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import type { ClasseFalha } from '../offline/tipos'

export type Sessao = z.infer<typeof SessaoSaida>
export type ErroApi = z.infer<typeof EsquemaErroApi>

/** SPEC Fase 1 E4: status 0 → rede; 5xx → servidor; 4xx sem `ErroApi` válido (portal de Wi-Fi) → rede; 4xx com `ErroApi` → recusa. */
export function classificarStatus(status: number, corpoValido: boolean): ClasseFalha {
  if (status === 0) return 'REDE'
  if (status >= 500) return 'SERVIDOR'
  return corpoValido ? 'RECUSA' : 'REDE'
}

/** Erro devolvido pela API (ou fabricado quando a resposta não segue o contrato). */
export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly erro: ErroApi,
    readonly classe: ClasseFalha = classificarStatus(status, true),
  ) {
    super(erro.mensagem)
    this.name = 'ErroDaApi'
  }
}

export interface OpcoesRequisicao {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  corpo?: unknown
}

interface Ouvintes {
  /** Leva o usuário a outra rota (o roteador registra isto em main.tsx). */
  navegar?: (caminho: string) => void
  /** Refresh recusado com 401 ou repetição ainda 401: a sessão acabou. */
  aoSessaoPerdida?: () => void
  /** 403 VINCULO_INATIVO numa requisição comum: a sessão precisa ser relida. */
  aoVinculoInativo?: () => void
  /** Uma requisição não chegou à API (status 0): a conexão caiu. */
  aoFalhaDeRede?: () => void
  /** A API respondeu 2xx: houve contato real (atualiza o `ultimoContatoEm`). */
  aoContato?: () => void
}

const ROTA_DE_REFRESH = '/api/auth/refresh'
const MENSAGEM_GENERICA = 'Não foi possível concluir agora. Tente de novo.'

/** O access token vive só neste módulo: fora de localStorage, sessionStorage e cookie. */
let tokenAcesso: string | null = null
let ouvintes: Ouvintes = {}
let renovacaoEmAndamento: Promise<Sessao> | null = null

export const lerTokenAcesso = (): string | null => tokenAcesso
export const definirTokenAcesso = (token: string | null): void => {
  tokenAcesso = token
}

export function configurarCliente(novos: Ouvintes): void {
  ouvintes = { ...ouvintes, ...novos }
}

export function reiniciarCliente(): void {
  tokenAcesso = null
  ouvintes = {}
  renovacaoEmAndamento = null
}

/** Rotas de auth que dispensam token: 401 nelas é resposta, não sessão vencida. sair-de-todos exige token e fica fora daqui. */
const ROTAS_SEM_TOKEN = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/papel-ativo',
  '/api/auth/logout',
  '/api/auth/convite/',
  '/api/auth/senha/',
]
const ehRotaSemToken = (caminho: string): boolean => ROTAS_SEM_TOKEN.some((rota) => caminho.startsWith(rota))

async function enviar(caminho: string, opcoes: OpcoesRequisicao): Promise<Response> {
  const cabecalhos: Record<string, string> = { Accept: 'application/json' }
  if (tokenAcesso) cabecalhos['Authorization'] = `Bearer ${tokenAcesso}`
  if (opcoes.corpo !== undefined) cabecalhos['Content-Type'] = 'application/json'

  let resposta: Response
  try {
    resposta = await fetch(caminho, {
      method: opcoes.metodo ?? 'GET',
      headers: cabecalhos,
      credentials: 'same-origin',
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    })
  } catch {
    ouvintes.aoFalhaDeRede?.()
    throw new ErroDaApi(0, { codigo: 'ERRO_INTERNO', mensagem: 'Sem conexão. Confira a internet e tente de novo.' })
  }
  if (resposta.ok) ouvintes.aoContato?.()
  return resposta
}

/** Monta o erro de uma resposta que não é 2xx, ou de um corpo já lido (XHR), aplicando a classificação E4. */
export function erroDeResposta(status: number, corpo: unknown): ErroDaApi {
  const lido = EsquemaErroApi.safeParse(corpo)
  return new ErroDaApi(
    status,
    lido.success ? lido.data : { codigo: 'ERRO_INTERNO', mensagem: MENSAGEM_GENERICA },
    classificarStatus(status, lido.success),
  )
}

async function lerErro(resposta: Response): Promise<ErroDaApi> {
  const corpo: unknown = await resposta.json().catch(() => null)
  return erroDeResposta(resposta.status, corpo)
}

/** 2xx que não é o JSON esperado (portal de Wi-Fi, proxy): conta como rede (E4). */
const erroForaDoContrato = (status: number): ErroDaApi =>
  new ErroDaApi(status, { codigo: 'ERRO_INTERNO', mensagem: MENSAGEM_GENERICA }, 'REDE')

function tratarVinculoInativo(erro: ErroDaApi, avisarSessao: boolean): void {
  if (erro.status !== 403 || erro.erro.codigo !== 'VINCULO_INATIVO') return
  ouvintes.navegar?.('/papel')
  if (avisarSessao) ouvintes.aoVinculoInativo?.()
}

async function chamarRefresh(): Promise<Sessao> {
  const resposta = await enviar(ROTA_DE_REFRESH, { metodo: 'POST' })
  if (!resposta.ok) {
    const erro = await lerErro(resposta)
    tratarVinculoInativo(erro, false)
    throw erro
  }
  const lida = SessaoSaida.safeParse(await resposta.json().catch(() => undefined))
  if (!lida.success) throw erroForaDoContrato(resposta.status)
  tokenAcesso = lida.data.accessToken
  return lida.data
}

/**
 * Renova a sessão pelo cookie de refresh. Duas camadas: as chamadas da mesma aba compartilham uma
 * promessa só, e entre abas o pedido entra na fila do Web Lock `refresh` (o cookie gira a cada uso).
 */
export function renovarSessao(): Promise<Sessao> {
  if (renovacaoEmAndamento) return renovacaoEmAndamento
  const atual: Promise<Sessao> = (async () => await navigator.locks.request('refresh', chamarRefresh))().finally(() => {
    if (renovacaoEmAndamento === atual) renovacaoEmAndamento = null
  })
  renovacaoEmAndamento = atual
  return atual
}

/** Recusa do refresh (401/403 com `ErroApi`, E7) acaba a sessão; vínculo inativo é outra coisa: leva a /papel. */
export function avisarSeRefreshRecusado(erroRefresh: unknown): void {
  if (!(erroRefresh instanceof ErroDaApi) || erroRefresh.classe !== 'RECUSA') return
  if (erroRefresh.status !== 401 && erroRefresh.status !== 403) return
  if (erroRefresh.erro.codigo === 'VINCULO_INATIVO') return
  ouvintes.aoSessaoPerdida?.()
}

/** A repetição autenticada também levou 401: o refresh valeu, mas a sessão não. */
export function avisarSessaoPerdida(): void {
  ouvintes.aoSessaoPerdida?.()
}

async function executar(caminho: string, opcoes: OpcoesRequisicao): Promise<Response> {
  let resposta = await enviar(caminho, opcoes)

  if (resposta.status === 401 && !ehRotaSemToken(caminho)) {
    const erroOriginal = await lerErro(resposta)
    try {
      await renovarSessao()
    } catch (erroRefresh) {
      if (erroRefresh instanceof ErroDaApi && erroRefresh.classe !== 'RECUSA') throw erroRefresh
      avisarSeRefreshRecusado(erroRefresh)
      throw erroOriginal
    }
    resposta = await enviar(caminho, opcoes)
    if (resposta.status === 401) {
      avisarSessaoPerdida()
      throw await lerErro(resposta)
    }
  }

  if (!resposta.ok) {
    const erro = await lerErro(resposta)
    tratarVinculoInativo(erro, true)
    throw erro
  }
  return resposta
}

/** Requisição com resposta JSON validada pelo contrato do `shared`. */
export async function requisitar<S extends z.ZodType>(
  caminho: string,
  esquema: S,
  opcoes: OpcoesRequisicao = {},
): Promise<z.output<S>> {
  const resposta = await executar(caminho, opcoes)
  const lido = esquema.safeParse(await resposta.json().catch(() => undefined))
  if (!lido.success) throw erroForaDoContrato(resposta.status)
  return lido.data
}

/** Como `requisitar`, mas devolve o corpo cru: quem chama valida (o motor da fila valida com a `saida` do tipo). */
export async function requisitarCru(caminho: string, opcoes: OpcoesRequisicao = {}): Promise<unknown> {
  const resposta = await executar(caminho, opcoes)
  const corpo: unknown = await resposta.json().catch(() => undefined)
  if (corpo === undefined) throw erroForaDoContrato(resposta.status)
  return corpo
}

/** Requisição cuja resposta é 204 (logout, convite reenviado…). */
export async function requisitarSemResposta(caminho: string, opcoes: OpcoesRequisicao = {}): Promise<void> {
  await executar(caminho, opcoes)
}

export function montarConsulta(parametros: Record<string, string | number | boolean | undefined>): string {
  const consulta = new URLSearchParams()
  for (const [chave, valor] of Object.entries(parametros)) {
    if (valor !== undefined) consulta.set(chave, String(valor))
  }
  const texto = consulta.toString()
  return texto ? `?${texto}` : ''
}
