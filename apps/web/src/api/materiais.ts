import { ClasseDetalheSaida, FORMATOS_MATERIAL, MaterialSaida } from '@desbravadores/shared'
import type { MaterialArquivoDados, MaterialEditarEntrada, MaterialLinkEntrada } from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { ErroDaApi, erroDeResposta, lerTokenAcesso, renovarSessao, requisitar, requisitarSemResposta } from './cliente'

export type Material = z.infer<typeof MaterialSaida>
export type NovoLink = z.input<typeof MaterialLinkEntrada>
export type EdicaoMaterial = z.input<typeof MaterialEditarEntrada>
export type DadosDoArquivo = z.input<typeof MaterialArquivoDados>

const RAIZ = 'materiais'

/** Extensões aceitas no envio, na ordem de FORMATOS_MATERIAL (`.pdf,.pptx,…`). */
export const EXTENSOES_ACEITAS = Object.keys(FORMATOS_MATERIAL).map((extensao) => `.${extensao}`)

export const chavesMateriais = {
  raiz: [RAIZ] as const,
  lista: (classeId: string) => [RAIZ, classeId] as const,
  secoes: (classeId: string) => ['classes', classeId, 'secoes'] as const,
}

/** B12: como as observações, o cache dos materiais não sobrevive à saída da tela (as URLs assinadas expiram em 10 min). */
export function useMateriais(classeId: string, habilitada = true) {
  return useQuery({
    queryKey: chavesMateriais.lista(classeId),
    queryFn: () => requisitar(`/api/classes/${classeId}/materiais`, z.array(MaterialSaida)),
    enabled: habilitada && classeId !== '',
    gcTime: 0,
  })
}

/** Seções do caderno da classe, para o envio e o "mover de seção". */
export function useSecoesDaClasse(classeId: string, habilitada = true) {
  return useQuery({
    queryKey: chavesMateriais.secoes(classeId),
    queryFn: async () => (await requisitar(`/api/classes/${classeId}`, ClasseDetalheSaida)).secoes,
    enabled: habilitada && classeId !== '',
  })
}

/** XHR, como o envio de fotos da fila: o navegador monta o multipart e o `Content-Type` com a fronteira. */
function enviarUmaVez(arquivo: File, dados: DadosDoArquivo): Promise<{ status: number; corpo: unknown }> {
  return new Promise((resolver) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/materiais/arquivo')
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

async function enviarArquivo(arquivo: File, dados: DadosDoArquivo): Promise<Material> {
  let resposta = await enviarUmaVez(arquivo, dados)
  if (resposta.status === 401) {
    await renovarSessao()
    resposta = await enviarUmaVez(arquivo, dados)
  }
  if (resposta.status === 0) throw new ErroDaApi(0, { codigo: 'ERRO_INTERNO', mensagem: 'Sem conexão. Confira a internet e tente de novo.' })
  if (resposta.status < 200 || resposta.status >= 300) throw erroDeResposta(resposta.status, resposta.corpo)
  const lido = MaterialSaida.safeParse(resposta.corpo)
  if (!lido.success) throw erroDeResposta(resposta.status, null)
  return lido.data
}

export function useEnviarArquivoMaterial() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: ({ arquivo, dados }: { arquivo: File; dados: DadosDoArquivo }) => enviarArquivo(arquivo, dados),
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: chavesMateriais.raiz }),
  })
}

export function useAdicionarLinkMaterial() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: (entrada: NovoLink) => requisitar('/api/materiais/link', MaterialSaida, { metodo: 'POST', corpo: entrada }),
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: chavesMateriais.raiz }),
  })
}

export function useEditarMaterial() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: ({ id, ...corpo }: EdicaoMaterial & { id: string }) =>
      requisitar(`/api/materiais/${id}`, MaterialSaida, { metodo: 'PATCH', corpo }),
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: chavesMateriais.raiz }),
  })
}

export function useApagarMaterial() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: (id: string) => requisitarSemResposta(`/api/materiais/${id}`, { metodo: 'DELETE' }),
    onSuccess: () => clienteConsultas.invalidateQueries({ queryKey: chavesMateriais.raiz }),
  })
}
