import { ImportacaoEntrada, ImportacaoRecusada, ImportacaoSaida, LinhaDaPrevia, LinhaImportada, PreviaImportacao } from '@desbravadores/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { ErroDaApi, erroDeResposta, lerTokenAcesso, renovarSessao, requisitar } from './cliente'
import { chavesDesbravadores } from './desbravadores'
import { invalidarUnidades } from './unidades'

export type LinhaDaPreviaImportacao = z.infer<typeof LinhaDaPrevia>
export type LinhaParaImportar = z.infer<typeof LinhaImportada>
export type Previa = z.infer<typeof PreviaImportacao>
export type ErrosPorLinha = z.infer<typeof ImportacaoRecusada>['erros']

const SEM_CONEXAO = 'Sem conexão. Confira a internet e tente de novo.'
const NOME_DO_MODELO = 'modelo-desbravadores.xlsx'

interface RespostaCrua {
  status: number
  corpo: unknown
}

/** XHR, como o envio de materiais: o navegador monta o multipart e o `Content-Type` com a fronteira. */
function enviarUmaVez(arquivo: File): Promise<RespostaCrua> {
  return new Promise((resolver) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/desbravadores/importacao/previa')
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
    formulario.append('arquivo', arquivo, arquivo.name)
    xhr.send(formulario)
  })
}

async function enviarPlanilha(arquivo: File): Promise<Previa> {
  let resposta = await enviarUmaVez(arquivo)
  if (resposta.status === 401) {
    await renovarSessao()
    resposta = await enviarUmaVez(arquivo)
  }
  if (resposta.status === 0) throw new ErroDaApi(0, { codigo: 'ERRO_INTERNO', mensagem: SEM_CONEXAO }, 'REDE')
  if (resposta.status < 200 || resposta.status >= 300) throw erroDeResposta(resposta.status, resposta.corpo)
  const lido = PreviaImportacao.safeParse(resposta.corpo)
  if (!lido.success) throw erroDeResposta(resposta.status, null)
  return lido.data
}

export function useEnviarPlanilha() {
  return useMutation({ networkMode: 'always', mutationFn: enviarPlanilha })
}

export function useConfirmarImportacao() {
  const cliente = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: (linhas: LinhaParaImportar[]) =>
      requisitar('/api/desbravadores/importacao', ImportacaoSaida, {
        metodo: 'POST',
        corpo: ImportacaoEntrada.parse({ linhas }),
      }),
    onSuccess: () =>
      Promise.all([cliente.invalidateQueries({ queryKey: chavesDesbravadores.todos }), invalidarUnidades(cliente)]),
  })
}

/** Erros por linha de uma confirmação recusada; `null` quando a falha é de outro tipo. */
export function errosDaRecusa(falha: unknown): ErrosPorLinha | null {
  if (!(falha instanceof ErroDaApi)) return null
  const lido = ImportacaoRecusada.safeParse(falha.corpo)
  return lido.success ? lido.data.erros : null
}

async function buscarModelo(): Promise<Response> {
  const pedir = () => {
    const token = lerTokenAcesso()
    return fetch('/api/desbravadores/importacao/modelo', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'same-origin',
    })
  }
  let resposta = await pedir()
  if (resposta.status === 401) {
    await renovarSessao()
    resposta = await pedir()
  }
  return resposta
}

/** O modelo exige o token, que vive só na memória: por isso vem por fetch, e não por um link direto. */
export async function baixarModelo(): Promise<void> {
  let resposta: Response
  try {
    resposta = await buscarModelo()
  } catch {
    throw new ErroDaApi(0, { codigo: 'ERRO_INTERNO', mensagem: SEM_CONEXAO }, 'REDE')
  }
  if (!resposta.ok) throw erroDeResposta(resposta.status, await resposta.json().catch(() => null))
  const endereco = URL.createObjectURL(await resposta.blob())
  const link = document.createElement('a')
  link.href = endereco
  link.download = NOME_DO_MODELO
  link.click()
  URL.revokeObjectURL(endereco)
}
