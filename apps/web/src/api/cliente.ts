import { ErroApi as EsquemaErroApi, SessaoSaida } from '@desbravadores/shared'
import { captureException, captureMessage } from '@sentry/react'
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
    /** Corpo cru da resposta, para a rota que devolve mais que o `ErroApi` (ex.: erros por linha). */
    readonly corpo: unknown = null,
  ) {
    super(erro.mensagem)
    this.name = 'ErroDaApi'
  }
}

export interface OpcoesRequisicao {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  corpo?: unknown
  /** Vínculo em nome do qual o pedido sai (a fila): se a sessão renovada for de outro, o pedido não é repetido. */
  vinculoEsperado?: string
  /** Cabeçalhos a mais (ex.: o segredo do aparelho nas rotas públicas do link de substituição). */
  cabecalhos?: Record<string, string>
}

/** A sessão renovada no meio de um pedido é de outro vínculo (o papel foi trocado em outra aba). */
export class SessaoDeOutroVinculo extends Error {
  constructor(readonly vinculoId: string | null) {
    super('A sessão renovada é de outro vínculo')
    this.name = 'SessaoDeOutroVinculo'
  }
}

/** Repetir o pedido com a sessão de outro vínculo o mandaria com o papel errado: lança antes. */
export function conferirVinculoDaSessao(sessao: Sessao, vinculoEsperado: string | undefined): void {
  if (vinculoEsperado !== undefined && sessao.vinculoAtivoId !== vinculoEsperado) throw new SessaoDeOutroVinculo(sessao.vinculoAtivoId)
}

interface Ouvintes {
  /** Leva o usuário a outra rota (o roteador registra isto em main.tsx). */
  navegar?: (caminho: string) => void
  /** Refresh recusado com 401 ou repetição ainda 401: a sessão acabou. */
  aoSessaoPerdida?: () => void
  /** 403 VINCULO_INATIVO numa requisição comum: a sessão precisa ser relida. */
  aoVinculoInativo?: () => void
  /** Refresh recusado com 403 VINCULO_INATIVO: a pessoa não tem papel ativo em clube nenhum. */
  aoSemAcesso?: () => void
  /** Uma requisição não chegou à API (status 0): a conexão caiu. */
  aoFalhaDeRede?: () => void
  /** A API respondeu 2xx: houve contato real (atualiza o `ultimoContatoEm`). */
  aoContato?: () => void
  /** A API respondeu 2xx: o servidor está alcançável, então um "sem conexão" anterior já não vale. */
  aoServidorRespondeu?: () => void
}

const ROTA_DE_REFRESH = '/api/auth/refresh'
const MENSAGEM_GENERICA = 'Não foi possível concluir agora. Tente de novo.'

/** Modo do link de substituição: o token é a credencial do link e o cookie de refresh (da conta do membro) não é tocado. */
interface ModoSubstituicao {
  /** 401 SUBSTITUICAO_ENCERRADA: o link foi cancelado ou saiu do prazo. */
  aoEncerrar: () => void
}

/** O access token vive só neste módulo: fora de localStorage, sessionStorage e cookie. */
let tokenAcesso: string | null = null
let ouvintes: Ouvintes = {}
let renovacaoEmAndamento: Promise<Sessao> | null = null
let modoSubstituicao: ModoSubstituicao | null = null

export const lerTokenAcesso = (): string | null => tokenAcesso
export const definirTokenAcesso = (token: string | null): void => {
  tokenAcesso = token
}

export function configurarCliente(novos: Ouvintes): void {
  ouvintes = { ...ouvintes, ...novos }
}

export function reiniciarCliente(): void {
  enviosDeDiagnostico.clear()
  tokenAcesso = null
  ouvintes = {}
  renovacaoEmAndamento = null
  modoSubstituicao = null
}

/** Passa a falar com a credencial do link: nenhum 401 chama o refresh, e só SUBSTITUICAO_ENCERRADA encerra. */
export function entrarNoModoSubstituicao(credencial: string, aoEncerrar: () => void): void {
  tokenAcesso = credencial
  modoSubstituicao = { aoEncerrar }
}

export function sairDoModoSubstituicao(): void {
  if (!modoSubstituicao) return
  modoSubstituicao = null
  tokenAcesso = null
}

/** Rotas de auth que dispensam token: 401 nelas é resposta, não sessão vencida. sair-de-todos exige token e fica fora daqui. */
const ROTAS_SEM_TOKEN = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/papel-ativo',
  '/api/auth/logout',
  '/api/auth/convite/',
  '/api/auth/senha/',
  '/api/acesso/',
  '/api/auth/substituicao/',
]
const ehRotaSemToken = (caminho: string): boolean => ROTAS_SEM_TOKEN.some((rota) => caminho.startsWith(rota))

type OrigemDaFalhaDeRede = 'fetch-lancou' | 'erro-sem-corpo-padrao' | 'fora-do-contrato'

interface FalhaDeRede {
  metodo: string
  caminho: string
  status: number
  origem: OrigemDaFalhaDeRede
  contentType?: string | null
  /** Nome e mensagem do que o `fetch` lançou (TypeError: Failed to fetch, AbortError…). */
  erroDoFetch?: { name: string; message: string }
  /** Só de resposta que não é JSON (HTML de proxy ou portal); nunca de JSON, que pode ter dado pessoal. */
  corpoInicial?: string
  /** Caminho e código de cada falha do zod, sem o valor recebido. */
  issues?: string[]
}

const INTERVALO_DE_DIAGNOSTICO_MS = 10 * 60 * 1000
const TAMANHO_DO_CORPO_INICIAL = 200
const enviosDeDiagnostico = new Map<string, number>()
const TROCO_DE_ID = /\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)(?=\/|$)/gi

/** Caminho sem query string e com os ids trocados por `:id`, para agrupar no Sentry sem expor ninguém. */
const caminhoNormalizado = (caminho: string): string => (caminho.split('?')[0] ?? '').replace(TROCO_DE_ID, '/:id')

/** Falha classe REDE vai ao Sentry (sem mudar o que o usuário vê); 1 por caminho+origem a cada 10 min por aba. */
function registrarFalhaDeRede(falha: FalhaDeRede): void {
  const caminho = caminhoNormalizado(falha.caminho)
  const chave = `${caminho}|${falha.origem}`
  const agora = Date.now()
  const ultimo = enviosDeDiagnostico.get(chave)
  if (ultimo !== undefined && agora - ultimo < INTERVALO_DE_DIAGNOSTICO_MS) return
  enviosDeDiagnostico.set(chave, agora)
  captureMessage(`Falha de rede: ${falha.metodo} ${caminho} (${falha.origem})`, {
    level: 'warning',
    fingerprint: ['falha-de-rede', caminho, falha.origem],
    tags: { origem: falha.origem },
    extra: {
      metodo: falha.metodo,
      caminho,
      status: falha.status,
      origem: falha.origem,
      contentType: falha.contentType ?? null,
      erroDoFetch: falha.erroDoFetch,
      online: navigator.onLine,
      corpoInicial: falha.corpoInicial,
      issues: falha.issues,
    },
  })
}

const ehJson = (contentType: string | null): boolean => (contentType ?? '').toLowerCase().includes('json')

/** Primeiros caracteres do corpo, só se a resposta não for JSON; a cópia deixa o corpo original para quem for lê-lo. */
async function corpoInicialSeNaoJson(copia: Response): Promise<string | undefined> {
  if (ehJson(copia.headers.get('content-type'))) return undefined
  const texto = await copia.text().catch(() => '')
  return texto.slice(0, TAMANHO_DO_CORPO_INICIAL)
}

async function enviar(caminho: string, opcoes: OpcoesRequisicao): Promise<Response> {
  const cabecalhos: Record<string, string> = { ...opcoes.cabecalhos, Accept: 'application/json' }
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
  } catch (causa) {
    registrarFalhaDeRede({
      metodo: opcoes.metodo ?? 'GET',
      caminho,
      status: 0,
      origem: 'fetch-lancou',
      erroDoFetch: causa instanceof Error ? { name: causa.name, message: causa.message } : { name: 'desconhecido', message: String(causa) },
    })
    ouvintes.aoFalhaDeRede?.()
    throw new ErroDaApi(0, { codigo: 'ERRO_INTERNO', mensagem: 'Sem conexão. Confira a internet e tente de novo.' })
  }
  if (resposta.ok) {
    ouvintes.aoServidorRespondeu?.()
    ouvintes.aoContato?.()
  }
  return resposta
}

/** Monta o erro de uma resposta que não é 2xx, ou de um corpo já lido (XHR), aplicando a classificação E4. */
export function erroDeResposta(status: number, corpo: unknown): ErroDaApi {
  const lido = EsquemaErroApi.safeParse(corpo)
  return new ErroDaApi(
    status,
    lido.success ? lido.data : { codigo: 'ERRO_INTERNO', mensagem: MENSAGEM_GENERICA },
    classificarStatus(status, lido.success),
    corpo,
  )
}

async function lerErro(resposta: Response, caminho: string, metodo: string): Promise<ErroDaApi> {
  const copia = resposta.clone()
  const corpo: unknown = await resposta.json().catch(() => null)
  const erro = erroDeResposta(resposta.status, corpo)
  if (erro.classe === 'REDE') {
    registrarFalhaDeRede({
      metodo,
      caminho,
      status: resposta.status,
      origem: 'erro-sem-corpo-padrao',
      contentType: resposta.headers.get('content-type'),
      corpoInicial: await corpoInicialSeNaoJson(copia),
    })
  }
  return erro
}

/** 2xx que não é o JSON esperado (portal de Wi-Fi, proxy): conta como rede (E4). */
async function erroForaDoContrato(resposta: Response, copia: Response, caminho: string, metodo: string, issues?: string[]): Promise<ErroDaApi> {
  registrarFalhaDeRede({
    metodo,
    caminho,
    status: resposta.status,
    origem: 'fora-do-contrato',
    contentType: resposta.headers.get('content-type'),
    corpoInicial: await corpoInicialSeNaoJson(copia),
    issues,
  })
  return new ErroDaApi(resposta.status, { codigo: 'ERRO_INTERNO', mensagem: MENSAGEM_GENERICA }, 'REDE')
}

const descreverIssues = (issues: readonly { path: readonly PropertyKey[]; code: string }[]): string[] =>
  issues.map((issue) => `${issue.path.map(String).join('.') || '(raiz)'}: ${issue.code}`)

function tratarVinculoInativo(erro: ErroDaApi, avisarSessao: boolean): void {
  // Na tela do link não há papel a escolher: /papel levaria o substituto ao app da conta.
  if (modoSubstituicao) return
  if (erro.status !== 403 || erro.erro.codigo !== 'VINCULO_INATIVO') return
  ouvintes.navegar?.('/papel')
  if (avisarSessao) ouvintes.aoVinculoInativo?.()
}

async function chamarRefresh(): Promise<Sessao> {
  const resposta = await enviar(ROTA_DE_REFRESH, { metodo: 'POST' })
  if (!resposta.ok) {
    const erro = await lerErro(resposta, ROTA_DE_REFRESH, 'POST')
    // Sem vínculo escolhido, o refresh só recusa por VINCULO_INATIVO quem não tem papel ativo em clube
    // nenhum: não há papel a escolher, então não vai a /papel — a sessão sai e leva o aviso ao login.
    if (erro.status === 403 && erro.erro.codigo === 'VINCULO_INATIVO') ouvintes.aoSemAcesso?.()
    throw erro
  }
  const copia = resposta.clone()
  const lida = SessaoSaida.safeParse(await resposta.json().catch(() => undefined))
  if (!lida.success) throw await erroForaDoContrato(resposta, copia, ROTA_DE_REFRESH, 'POST', descreverIssues(lida.error.issues))
  tokenAcesso = lida.data.accessToken
  return lida.data
}

/**
 * Renova a sessão pelo cookie de refresh. Duas camadas: as chamadas da mesma aba compartilham uma
 * promessa só, e entre abas o pedido entra na fila do Web Lock `refresh` (o cookie gira a cada uso).
 */
export function renovarSessao(): Promise<Sessao> {
  // O cookie é da conta do membro: renovar daqui trocaria a sessão dele pela aba do substituto.
  if (modoSubstituicao) return Promise.reject(new ErroDaApi(401, { codigo: 'NAO_AUTENTICADO', mensagem: MENSAGEM_GENERICA }))
  if (renovacaoEmAndamento) return renovacaoEmAndamento
  const atual: Promise<Sessao> = (async () => await navigator.locks.request('refresh', chamarRefresh))().finally(() => {
    if (renovacaoEmAndamento === atual) renovacaoEmAndamento = null
  })
  renovacaoEmAndamento = atual
  return atual
}

/** Recusa do refresh (401/403 com `ErroApi`, E7) acaba a sessão; vínculo inativo é outra coisa: leva a /papel. */
export function avisarSeRefreshRecusado(erroRefresh: unknown): void {
  if (modoSubstituicao) return
  if (!(erroRefresh instanceof ErroDaApi) || erroRefresh.classe !== 'RECUSA') return
  if (erroRefresh.status !== 401 && erroRefresh.status !== 403) return
  if (erroRefresh.erro.codigo === 'VINCULO_INATIVO') return
  ouvintes.aoSessaoPerdida?.()
}

/** A repetição autenticada também levou 401: o refresh valeu, mas a sessão não. */
export function avisarSessaoPerdida(): void {
  if (modoSubstituicao) return
  ouvintes.aoSessaoPerdida?.()
}

/** 401 com a credencial do link: só SUBSTITUICAO_ENCERRADA encerra; outro código é rota fora da lista, um defeito. */
function tratar401DaSubstituicao(modo: ModoSubstituicao, erro: ErroDaApi, caminho: string): void {
  if (erro.erro.codigo === 'SUBSTITUICAO_ENCERRADA') {
    modo.aoEncerrar()
    return
  }
  captureException(new Error(`401 ${erro.erro.codigo} com a credencial de substituição`), { level: 'error', extra: { caminho } })
}

async function executar(caminho: string, opcoes: OpcoesRequisicao): Promise<Response> {
  const metodo = opcoes.metodo ?? 'GET'
  let resposta = await enviar(caminho, opcoes)

  if (resposta.status === 401 && modoSubstituicao && !ehRotaSemToken(caminho)) {
    const erro = await lerErro(resposta, caminho, metodo)
    tratar401DaSubstituicao(modoSubstituicao, erro, caminho)
    throw erro
  }

  if (resposta.status === 401 && !ehRotaSemToken(caminho)) {
    const erroOriginal = await lerErro(resposta, caminho, metodo)
    let renovada: Sessao
    try {
      renovada = await renovarSessao()
    } catch (erroRefresh) {
      if (erroRefresh instanceof ErroDaApi && erroRefresh.classe !== 'RECUSA') throw erroRefresh
      avisarSeRefreshRecusado(erroRefresh)
      throw erroOriginal
    }
    conferirVinculoDaSessao(renovada, opcoes.vinculoEsperado)
    resposta = await enviar(caminho, opcoes)
    if (resposta.status === 401) {
      avisarSessaoPerdida()
      throw await lerErro(resposta, caminho, metodo)
    }
  }

  if (!resposta.ok) {
    const erro = await lerErro(resposta, caminho, metodo)
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
  const copia = resposta.clone()
  const lido = esquema.safeParse(await resposta.json().catch(() => undefined))
  if (!lido.success) throw await erroForaDoContrato(resposta, copia, caminho, opcoes.metodo ?? 'GET', descreverIssues(lido.error.issues))
  return lido.data
}

/** Como `requisitar`, mas devolve o corpo cru: quem chama valida (o motor da fila valida com a `saida` do tipo). */
export async function requisitarCru(caminho: string, opcoes: OpcoesRequisicao = {}): Promise<unknown> {
  const resposta = await executar(caminho, opcoes)
  const copia = resposta.clone()
  const corpo: unknown = await resposta.json().catch(() => undefined)
  if (corpo === undefined) throw await erroForaDoContrato(resposta, copia, caminho, opcoes.metodo ?? 'GET')
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
