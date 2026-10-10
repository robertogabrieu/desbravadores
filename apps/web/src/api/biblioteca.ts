import { BibliotecaSaida, CategoriaBibliotecaSaida, ItemBibliotecaSaida } from '@desbravadores/shared'
import type { CategoriaBibliotecaEntrada, ItemBibliotecaDados, ItemBibliotecaEditar, MoverNaBiblioteca } from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErroDaApi, erroDeResposta, lerTokenAcesso, renovarSessao, requisitar, requisitarSemResposta } from './cliente'

export type ItemBiblioteca = ItemBibliotecaSaida
export type CategoriaBiblioteca = CategoriaBibliotecaSaida
export type DirecaoNaBiblioteca = MoverNaBiblioteca['direcao']

const RAIZ = 'biblioteca'
const chaveDaBiblioteca = [RAIZ] as const

const CINCO_MINUTOS = 5 * 60_000
/** As URLs assinadas valem 10 minutos: a lista é relida antes de vencerem. */
const OITO_MINUTOS = 8 * 60_000

/**
 * Como os materiais, o cache não sobrevive à saída da tela (`gcTime: 0`): as URLs assinadas expiram. Quem
 * volta à aba depois de 10 minutos relê a lista, e a aba aberta relê sozinha aos 8.
 */
export function useBiblioteca(habilitada = true) {
  return useQuery({
    queryKey: chaveDaBiblioteca,
    queryFn: () => requisitar('/api/biblioteca', BibliotecaSaida),
    enabled: habilitada,
    gcTime: 0,
    staleTime: CINCO_MINUTOS,
    refetchInterval: OITO_MINUTOS,
    refetchOnWindowFocus: true,
  })
}

/** Toda escrita relê a lista no fim, dê certo ou não: uma recusa por "já não existe" mostra a estante como ela está. */
function useEscrita<Variaveis, Resultado>(escrever: (variaveis: Variaveis) => Promise<Resultado>) {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: escrever,
    onSettled: () => clienteConsultas.invalidateQueries({ queryKey: chaveDaBiblioteca }),
  })
}

export const useCriarCategoria = () =>
  useEscrita((entrada: CategoriaBibliotecaEntrada) => requisitar('/api/biblioteca/categorias', CategoriaBibliotecaSaida, { metodo: 'POST', corpo: entrada }))

export const useRenomearCategoria = () =>
  useEscrita(({ id, ...corpo }: CategoriaBibliotecaEntrada & { id: string }) =>
    requisitar(`/api/biblioteca/categorias/${id}`, CategoriaBibliotecaSaida, { metodo: 'PATCH', corpo }),
  )

export const useMoverCategoria = () =>
  useEscrita(({ id, direcao }: MoverNaBiblioteca & { id: string }) =>
    requisitarSemResposta(`/api/biblioteca/categorias/${id}/mover`, { metodo: 'POST', corpo: { direcao } }),
  )

export const useExcluirCategoria = () =>
  useEscrita((id: string) => requisitarSemResposta(`/api/biblioteca/categorias/${id}`, { metodo: 'DELETE' }))

export const useEditarItem = () =>
  useEscrita(({ id, ...corpo }: ItemBibliotecaEditar & { id: string }) =>
    requisitar(`/api/biblioteca/itens/${id}`, ItemBibliotecaSaida, { metodo: 'PATCH', corpo }),
  )

export const useMoverItem = () =>
  useEscrita(({ id, direcao }: MoverNaBiblioteca & { id: string }) =>
    requisitarSemResposta(`/api/biblioteca/itens/${id}/mover`, { metodo: 'POST', corpo: { direcao } }),
  )

export const useRemoverItem = () => useEscrita((id: string) => requisitarSemResposta(`/api/biblioteca/itens/${id}`, { metodo: 'DELETE' }))

export const useTirarCapa = () =>
  useEscrita((id: string) => requisitar(`/api/biblioteca/itens/${id}/capa`, ItemBibliotecaSaida, { metodo: 'DELETE' }))

interface RespostaDoEnvio {
  status: number
  corpo: unknown
}

/**
 * XHR, como o envio de materiais: é o único jeito de ler o andamento (`upload.onprogress`). O navegador
 * monta o multipart e o `Content-Type` com a fronteira. O `sinal` interrompe o envio em curso.
 */
function enviarUmaVez(metodo: 'POST' | 'PUT', caminho: string, formulario: FormData, aoProgredir: (porcento: number) => void, sinal?: AbortSignal): Promise<RespostaDoEnvio> {
  return new Promise((resolver) => {
    if (sinal?.aborted) return resolver({ status: 0, corpo: null })
    const xhr = new XMLHttpRequest()
    const interromper = () => xhr.abort()
    const terminar = (resposta: RespostaDoEnvio) => {
      sinal?.removeEventListener('abort', interromper)
      resolver(resposta)
    }
    const semResposta = () => terminar({ status: 0, corpo: null })
    xhr.open(metodo, caminho)
    xhr.setRequestHeader('Accept', 'application/json')
    const token = lerTokenAcesso()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable && evento.total > 0) aoProgredir(Math.round((evento.loaded / evento.total) * 100))
    }
    xhr.onload = () => {
      let corpo: unknown = null
      try {
        corpo = JSON.parse(xhr.responseText)
      } catch {
        corpo = null
      }
      terminar({ status: xhr.status, corpo })
    }
    xhr.onerror = semResposta
    xhr.ontimeout = semResposta
    xhr.onabort = semResposta
    sinal?.addEventListener('abort', interromper, { once: true })
    xhr.send(formulario)
  })
}

async function enviar(metodo: 'POST' | 'PUT', caminho: string, formulario: FormData, aoProgredir: (porcento: number) => void, sinal?: AbortSignal): Promise<ItemBiblioteca> {
  aoProgredir(0)
  let resposta = await enviarUmaVez(metodo, caminho, formulario, aoProgredir, sinal)
  if (resposta.status === 401) {
    await renovarSessao()
    aoProgredir(0)
    resposta = await enviarUmaVez(metodo, caminho, formulario, aoProgredir, sinal)
  }
  if (resposta.status === 0) throw new ErroDaApi(0, { codigo: 'ERRO_INTERNO', mensagem: 'Sem conexão. Confira a internet e tente de novo.' })
  if (resposta.status < 200 || resposta.status >= 300) throw erroDeResposta(resposta.status, resposta.corpo)
  const lido = ItemBibliotecaSaida.safeParse(resposta.corpo)
  if (!lido.success) throw erroDeResposta(resposta.status, null)
  return lido.data
}

/** POST /biblioteca/itens: o PDF vai sozinho no corpo, junto dos `dados` em JSON. */
export function enviarItem(arquivo: File, dados: ItemBibliotecaDados, aoProgredir: (porcento: number) => void, sinal?: AbortSignal): Promise<ItemBiblioteca> {
  const formulario = new FormData()
  formulario.append('dados', JSON.stringify(dados))
  formulario.append('arquivo', arquivo, arquivo.name)
  return enviar('POST', '/api/biblioteca/itens', formulario, aoProgredir, sinal)
}

/** PUT /biblioteca/itens/:id/capa: põe a capa do item, ou troca a que ele tem. */
export function enviarCapa(itemId: string, capa: File, aoProgredir: (porcento: number) => void, sinal?: AbortSignal): Promise<ItemBiblioteca> {
  const formulario = new FormData()
  formulario.append('capa', capa, capa.name)
  return enviar('PUT', `/api/biblioteca/itens/${itemId}/capa`, formulario, aoProgredir, sinal)
}

/** Depois de enviar por `enviarItem` ou `enviarCapa`, que não passam por mutação: relê a estante. */
export function useRelerBiblioteca() {
  const clienteConsultas = useQueryClient()
  return () => clienteConsultas.invalidateQueries({ queryKey: chaveDaBiblioteca })
}
