import {
  ChamadaCBSaida,
  DatasSaida,
  EdicaoSaida,
  EdicoesSaida,
  EncontroDetalheSaida,
  EncontroSaida,
  FrequenciaGrupoSaida,
  GrupoCB,
  GruposSaida,
  PainelSaida,
  PontosCBSaida,
} from '@desbravadores/shared'
import type {
  CancelarEntrada,
  EdicaoRascunhoEntrada,
  GruposEntrada,
  MaterialCBArquivoDados,
  MaterialCBLinkEntrada,
  PontosCBEntrada,
  RemarcarEntrada,
  TerminarEntrada,
} from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { chavesCalendario } from './calendario'
import { ErroDaApi, erroDeResposta, lerTokenAcesso, renovarSessao, requisitar } from './cliente'

export type Edicoes = z.infer<typeof EdicoesSaida>
export type EdicaoResumoCB = Edicoes['edicoes'][number]
export type EdicaoCB = z.infer<typeof EdicaoSaida>
export type RascunhoDaEdicao = z.input<typeof EdicaoRascunhoEntrada>
export type GruposDaEdicao = z.infer<typeof GruposSaida>
export type GrupoDaEdicao = z.infer<typeof GrupoCB>
export type EntradaDosGrupos = z.input<typeof GruposEntrada>
export type DatasDaEdicao = z.infer<typeof DatasSaida>
export type PainelDaEdicao = z.infer<typeof PainelSaida>
export type FrequenciaDoGrupo = z.infer<typeof FrequenciaGrupoSaida>
export type EncontroCB = z.infer<typeof EncontroSaida>
export type DetalheDoEncontro = z.infer<typeof EncontroDetalheSaida>
export type ChamadaCB = z.infer<typeof ChamadaCBSaida>
export type PontosCB = z.infer<typeof PontosCBSaida>
export type LinkDoMaterial = z.input<typeof MaterialCBLinkEntrada>
export type DadosDoArquivoCB = z.input<typeof MaterialCBArquivoDados>

/** PDF do material de estudo: até 20 MB (regra 3). */
export const LIMITE_DO_PDF_CB = 20 * 1024 * 1024

const RAIZ = 'classe-biblica'

export const chavesClasseBiblica = {
  raiz: [RAIZ] as const,
  edicoes: [RAIZ, 'edicoes'] as const,
  painel: (id: string) => [RAIZ, 'edicao', id] as const,
  grupos: (id: string) => [RAIZ, 'edicao', id, 'grupos'] as const,
  datas: (id: string) => [RAIZ, 'edicao', id, 'datas'] as const,
  frequencia: (grupoId: string) => [RAIZ, 'grupo', grupoId, 'frequencia'] as const,
  encontro: (id: string) => [RAIZ, 'encontro', id] as const,
  chamada: (encontroId: string, grupoId: string) => [RAIZ, 'encontro', encontroId, 'chamada', grupoId] as const,
  pontos: [RAIZ, 'pontos'] as const,
}

const caminhoDaEdicao = (id: string) => `/api/classe-biblica/edicoes/${id}`
const caminhoDoEncontro = (id: string) => `/api/classe-biblica/encontros/${id}`

// ── Lista e rascunho ─────────────────────────────────────────────────────────

export function useEdicoesCB() {
  return useQuery({
    queryKey: chavesClasseBiblica.edicoes,
    queryFn: () => requisitar('/api/classe-biblica/edicoes', EdicoesSaida),
  })
}

export function useCriarRascunhoCB() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: (entrada: RascunhoDaEdicao) =>
      requisitar('/api/classe-biblica/edicoes', EdicaoSaida, { metodo: 'POST', corpo: entrada }),
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: chavesClasseBiblica.edicoes }),
  })
}

export function useSalvarRascunhoCB() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: ({ id, ...corpo }: RascunhoDaEdicao & { id: string }) =>
      requisitar(caminhoDaEdicao(id), EdicaoSaida, { metodo: 'PATCH', corpo }),
    onSuccess: (_edicao, { id }) => {
      void clienteConsultas.invalidateQueries({ queryKey: chavesClasseBiblica.edicoes })
      void clienteConsultas.invalidateQueries({ queryKey: chavesClasseBiblica.painel(id), exact: true })
    },
  })
}

// ── Grupos, datas e terminar ─────────────────────────────────────────────────

export function useGruposDaEdicao(id: string) {
  return useQuery({
    queryKey: chavesClasseBiblica.grupos(id),
    queryFn: () => requisitar(`${caminhoDaEdicao(id)}/grupos`, GruposSaida),
    // As URLs assinadas do material expiram em 10 min.
    gcTime: 0,
  })
}

export function useGravarGruposCB(id: string) {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: (entrada: EntradaDosGrupos) =>
      requisitar(`${caminhoDaEdicao(id)}/grupos`, GruposSaida, { metodo: 'PUT', corpo: entrada }),
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: chavesClasseBiblica.edicoes })
      void clienteConsultas.invalidateQueries({ queryKey: chavesClasseBiblica.painel(id), exact: true })
    },
  })
}

export function useDatasDaEdicao(id: string) {
  return useQuery({
    queryKey: chavesClasseBiblica.datas(id),
    queryFn: () => requisitar(`${caminhoDaEdicao(id)}/datas`, DatasSaida),
    gcTime: 0,
  })
}

export function useTerminarEdicaoCB(id: string) {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: (entrada: z.input<typeof TerminarEntrada>) =>
      requisitar(`${caminhoDaEdicao(id)}/terminar`, PainelSaida, { metodo: 'POST', corpo: entrada }),
    onSuccess: (painel) => {
      clienteConsultas.setQueryData(chavesClasseBiblica.painel(id), painel)
      void clienteConsultas.invalidateQueries({ queryKey: chavesClasseBiblica.edicoes })
      void clienteConsultas.invalidateQueries({ queryKey: chavesCalendario.todas })
    },
  })
}

// ── Painel e frequência ──────────────────────────────────────────────────────

/** Painel da edição; o campo `edicao` também serve às etapas do rascunho. */
export function usePainelDaEdicao(id: string) {
  return useQuery({
    queryKey: chavesClasseBiblica.painel(id),
    queryFn: () => requisitar(caminhoDaEdicao(id), PainelSaida),
    gcTime: 0,
  })
}

export function useFrequenciaDoGrupo(grupoId: string, habilitada = true) {
  return useQuery({
    queryKey: chavesClasseBiblica.frequencia(grupoId),
    queryFn: () => requisitar(`/api/classe-biblica/grupos/${grupoId}/frequencia`, FrequenciaGrupoSaida),
    enabled: habilitada && grupoId !== '',
  })
}

// ── Material ─────────────────────────────────────────────────────────────────

/** XHR, como o envio de material da classe: o navegador monta o multipart e o `Content-Type` com a fronteira. */
function enviarUmaVez(grupoId: string, arquivo: File, dados: DadosDoArquivoCB): Promise<{ status: number; corpo: unknown }> {
  return new Promise((resolver) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/classe-biblica/grupos/${grupoId}/material/arquivo`)
    xhr.setRequestHeader('Accept', 'application/json')
    const token = lerTokenAcesso()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.onload = () => {
      let corpo: unknown = null
      try {
        corpo = JSON.parse(xhr.responseText)
      } catch {
        corpo = null
      }
      resolver({ status: xhr.status, corpo })
    }
    const semResposta = () => resolver({ status: 0, corpo: null })
    xhr.onerror = semResposta
    xhr.ontimeout = semResposta
    xhr.onabort = semResposta
    const formulario = new FormData()
    formulario.append('dados', JSON.stringify(dados))
    formulario.append('arquivo', arquivo, arquivo.name)
    xhr.send(formulario)
  })
}

async function enviarArquivo(grupoId: string, arquivo: File, dados: DadosDoArquivoCB): Promise<GrupoDaEdicao> {
  let resposta = await enviarUmaVez(grupoId, arquivo, dados)
  if (resposta.status === 401) {
    await renovarSessao()
    resposta = await enviarUmaVez(grupoId, arquivo, dados)
  }
  if (resposta.status === 0) throw new ErroDaApi(0, { codigo: 'ERRO_INTERNO', mensagem: 'Sem conexão. Confira a internet e tente de novo.' })
  if (resposta.status < 200 || resposta.status >= 300) throw erroDeResposta(resposta.status, resposta.corpo)
  const lido = GrupoCB.safeParse(resposta.corpo)
  if (!lido.success) throw erroDeResposta(resposta.status, null)
  return lido.data
}

export function useEnviarMaterialCB() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: ({ grupoId, arquivo, dados }: { grupoId: string; arquivo: File; dados: DadosDoArquivoCB }) =>
      enviarArquivo(grupoId, arquivo, dados),
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: [RAIZ, 'edicao'] }),
  })
}

export function useAnexarLinkCB() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: ({ grupoId, ...corpo }: LinkDoMaterial & { grupoId: string }) =>
      requisitar(`/api/classe-biblica/grupos/${grupoId}/material/link`, GrupoCB, { metodo: 'POST', corpo }),
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: [RAIZ, 'edicao'] }),
  })
}

// ── Encontros ────────────────────────────────────────────────────────────────

export function useEncontroCB(id: string) {
  return useQuery({
    queryKey: chavesClasseBiblica.encontro(id),
    queryFn: () => requisitar(caminhoDoEncontro(id), EncontroDetalheSaida),
    enabled: id !== '',
  })
}

function useEscritaDoEncontro<E>(acao: string, corpoDe: (entrada: E) => unknown) {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: ({ id, entrada }: { id: string; entrada: E }) =>
      requisitar(`${caminhoDoEncontro(id)}/${acao}`, EncontroSaida, { metodo: 'POST', corpo: corpoDe(entrada) }),
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: chavesClasseBiblica.raiz })
      void clienteConsultas.invalidateQueries({ queryKey: chavesCalendario.todas })
    },
  })
}

export const useRemarcarEncontroCB = () => useEscritaDoEncontro<z.input<typeof RemarcarEntrada>>('remarcar', (entrada) => entrada)
export const useCancelarEncontroCB = () => useEscritaDoEncontro<z.input<typeof CancelarEntrada>>('cancelar', (entrada) => entrada)
export const useDesfazerCancelamentoCB = () => useEscritaDoEncontro<null>('desfazer-cancelamento', () => undefined)

// ── Chamada (leitura; o envio é da fila) ─────────────────────────────────────

export function useChamadaCB(encontroId: string, grupoId: string, habilitada = true) {
  return useQuery({
    queryKey: chavesClasseBiblica.chamada(encontroId, grupoId),
    queryFn: () => requisitar(`${caminhoDoEncontro(encontroId)}/grupos/${grupoId}/chamada`, ChamadaCBSaida),
    enabled: habilitada && encontroId !== '' && grupoId !== '',
    // A chamada é corrigida em cima do que já foi gravado: abrir com uma leitura antiga desfaria o que a fila acabou de enviar.
    staleTime: 0,
    gcTime: 0,
  })
}

// ── Pontos ───────────────────────────────────────────────────────────────────

export function usePontosCB() {
  return useQuery({
    queryKey: chavesClasseBiblica.pontos,
    queryFn: () => requisitar('/api/classe-biblica/pontos', PontosCBSaida),
  })
}

export function useSalvarPontosCB() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: (entrada: z.input<typeof PontosCBEntrada>) =>
      requisitar('/api/classe-biblica/pontos', PontosCBSaida, { metodo: 'PATCH', corpo: entrada }),
    onSuccess: (pontos) => clienteConsultas.setQueryData(chavesClasseBiblica.pontos, pontos),
  })
}
