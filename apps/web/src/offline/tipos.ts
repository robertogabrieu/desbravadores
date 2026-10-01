// Contrato do módulo offline (SPEC Fase 1 §4.3). Escrito pelo orquestrador: o motor (1a-A2)
// implementa, a interface (1a-A3) e os tipos da 1b (REUNIAO, FOTO) e da Fase 2 (AULA) consomem.
// Mudar uma assinatura aqui é mudar o contrato — passa pelo orquestrador.
import type { PacoteSaida, ReuniaoEnvio } from '@desbravadores/shared'
import type { QueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import type { ErroApi, OpcoesRequisicao } from '../api/cliente'

export type EstadoItem = 'NA_FILA' | 'ENVIANDO' | 'ENVIADO' | 'ERRO'

/** Instantes em epoch ms (ordenáveis no índice do Dexie e usados direto no backoff). */
export interface ItemFila<P = unknown> {
  id: string
  versaoPayload: 1
  usuarioId: string
  vinculoId: string
  tipo: string
  /** Itens com a mesma chave se fundem (SPEC §4.3). REUNIAO = `<unidadeId>:<data>`; FOTO = `foto:<fotoId>`. */
  chave: string
  /** Só roda quando não houver item desta chave que não esteja ENVIADO. */
  dependeDe?: string
  rotulo: string
  detalhe: string
  payload: P
  blob?: Blob
  estado: EstadoItem
  /** 0 a 100. */
  progresso: number
  tentativas: number
  proximaTentativaEm: number | null
  erro?: { codigo: string; mensagem: string }
  criadoEm: number
  atualizadoEm: number
  enviadoEm?: number
}

/** Como a resposta foi classificada (SPEC E4). */
export type ClasseFalha = 'REDE' | 'SERVIDOR' | 'RECUSA'

/** O que `requisitar` e `enviarArquivo` do contexto lançam quando a resposta não é 2xx
 *  (ou é 2xx sem JSON). `status` 0 = sem resposta. `erro` só em RECUSA. */
export interface FalhaEnvio {
  classe: ClasseFalha
  status: number
  erro?: ErroApi
}

export interface ArquivoEnvio {
  metodo: 'PUT' | 'POST'
  /** Campos de texto do multipart (ex.: `dados` com o JSON). */
  campos: Record<string, string>
  /** Nome do campo do arquivo no multipart (ex.: `arquivo`). */
  campoArquivo: string
  arquivo: Blob
  nomeArquivo: string
}

export interface ContextoEnvio {
  /** Requisição JSON autenticada; devolve o corpo cru (o motor valida com `saida`). Lança `FalhaEnvio`. */
  requisitar(caminho: string, opcoes?: OpcoesRequisicao): Promise<unknown>
  /** Multipart autenticado por XMLHttpRequest; `onProgresso` recebe 0 a 100. Lança `FalhaEnvio`. */
  enviarArquivo(caminho: string, arquivo: ArquivoEnvio, onProgresso: (percentual: number) => void): Promise<unknown>
  queryClient: QueryClient
}

export interface ContextoAposEnvio<P = unknown> {
  item: ItemFila<P>
  queryClient: QueryClient
  /** Itens seguintes da mesma chave (não ENVIADO), em `criadoEm`. */
  seguintesDaChave(): Promise<ItemFila<P>[]>
  /** Troca o payload de um item que ainda não foi enviado (ex.: atualizar `versaoVista`). */
  atualizarPayload(id: string, payload: P): Promise<void>
  /** Baixa o pacote do domingo de novo (SPEC §4.2); só regrava se a versão mudou. */
  baixarPacote(): Promise<void>
}

export interface TipoFila<P = unknown, S extends z.ZodType = z.ZodType> {
  tipo: string
  rotulo(payload: P): string
  detalhe(payload: P, blob?: Blob): string
  /** Chamado ao enfileirar com a chave de um item NA_FILA/ERRO do mesmo usuário. */
  fundir(anterior: P, novo: P): P
  enviar(item: ItemFila<P>, ctx: ContextoEnvio): Promise<unknown>
  /** Contrato de saída: sucesso = 2xx **e** `saida.safeParse` ok. */
  saida: S
  aoEnviar?(saida: z.output<S>, ctx: ContextoAposEnvio<P>): Promise<void> | void
}

export interface EntradaFila<P = unknown> {
  tipo: string
  chave: string
  dependeDe?: string
  payload: P
  blob?: Blob
}

/** Item como a tela o mostra. */
export interface ItemFilaNaTela extends ItemFila {
  /** Tem `dependeDe` e a dependência ainda não foi ENVIADA ("Esperando a chamada ser enviada"). */
  esperandoDependencia: boolean
}

export interface EstadoFila {
  /** Da sessão atual, em `criadoEm`. ENVIADO aparece até ser limpo (24 h). */
  itens: ItemFilaNaTela[]
  /** `pendentes` = NA_FILA + ENVIANDO; `erros` = ERRO. O selo mostra a soma. */
  contagem: { pendentes: number; erros: number }
  avisos: {
    /** 401 sem refresh possível: "Entre de novo para enviar". */
    pausadaPorSessao: boolean
    /** Fila acima de 100 MB: "Pouco espaço: envie as fotos quando houver internet". */
    poucoEspaco: boolean
    /** Itens de outra pessoa descartados na abertura (E18); 0 = nada a avisar. */
    descartadosDeOutraPessoa: number
    /** iPhone fora da tela inicial (E22). */
    instalarNaTelaInicial: boolean
  }
  tentarAgora(): void
  tentarDeNovo(id: string): Promise<void>
  /** Itens que dependem deste (para a confirmação de descarte listar). */
  dependentes(id: string): ItemFilaNaTela[]
  /** Apaga o item; os dependentes viram ERRO "A chamada foi descartada". Confirmar é da tela. */
  descartar(id: string): Promise<void>
}

export type ModoConexao = 'ONLINE' | 'SEM_CONEXAO'
export type ModoSessao = ModoConexao | 'EXPIRADA'

// Assinaturas das funções exportadas por `offline/index.ts`.
export type RegistrarTipo = <P, S extends z.ZodType>(def: TipoFila<P, S>) => void
export type Enfileirar = <P>(entrada: EntradaFila<P>) => Promise<string>
export type UseFila = () => EstadoFila
export type ItensDaChave = (chave: string) => Promise<ItemFila[]>
/** NA_FILA, ENVIANDO e ERRO do vínculo, em `criadoEm` (aviso de envios do papel que ficou para trás). */
export type NaoEnviadosDoVinculo = (usuarioId: string, vinculoId: string) => Promise<ItemFila[]>
export type UseConexao = () => { modo: ModoConexao }
export type UseModoSessao = () => ModoSessao
export type LimparDadosDoUsuario = (usuarioId: string, opcoes: { manterFila: true }) => Promise<void>

// Acrescentado na onda 0 da 1b: o que as telas da chamada, do início e da galeria leem do aparelho.

/** Pacote do domingo guardado para o usuário e o vínculo da sessão; muda quando uma versão nova é gravada. */
export interface PacoteGuardado {
  pacote: z.infer<typeof PacoteSaida> | null
  /** `true` só até a primeira leitura do banco local. */
  carregando: boolean
  /** Quando o pacote guardado foi baixado (epoch ms); nulo sem pacote. */
  baixadoEm: number | null
}
export type UsePacote = () => PacoteGuardado

/** Rascunho local por usuário e chave (REUNIAO usa `<unidadeId>:<data>`). O valor volta cru: quem lê valida. */
export type LerRascunho = (usuarioId: string, chave: string) => Promise<unknown>
export type GravarRascunho = (usuarioId: string, chave: string, valor: unknown) => Promise<void>
export type ApagarRascunho = (usuarioId: string, chave: string) => Promise<void>

/** Payload do item REUNIAO (chave `<unidadeId>:<data>`). O tipo (B4) escreve; o histórico (B5) lê
 *  para mostrar as chamadas ainda não enviadas, com os números tirados de `corpo.linhas`. */
export interface PayloadReuniao {
  /** O `:uuid` do PUT: id da reunião existente, ou UUID novo gerado no aparelho. */
  reuniaoId: string
  /** `true` quando a reunião já existia (rótulo "Correção na chamada · …"). */
  correcao: boolean
  unidadeNome: string
  corpo: z.infer<typeof ReuniaoEnvio>
}
