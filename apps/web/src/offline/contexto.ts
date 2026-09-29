import type { QueryClient } from '@tanstack/react-query'
import { ErroDaApi, avisarSeRefreshRecusado, avisarSessaoPerdida, erroDeResposta, lerTokenAcesso, renovarSessao, requisitarCru } from '../api/cliente'
import { dependencias } from './dependencias'
import type { ArquivoEnvio, ClasseFalha, ContextoEnvio, FalhaEnvio } from './tipos'
import type { ErroApi } from '../api/cliente'

/** O que `requisitar` e `enviarArquivo` do contexto lançam: implementa `FalhaEnvio` (SPEC E4). */
export class ErroDeEnvio extends Error implements FalhaEnvio {
  constructor(
    readonly classe: ClasseFalha,
    readonly status: number,
    readonly erro?: ErroApi,
  ) {
    super(erro?.mensagem ?? 'Falha no envio')
    this.name = 'ErroDeEnvio'
  }
}

export const ehFalhaEnvio = (valor: unknown): valor is FalhaEnvio =>
  typeof valor === 'object' && valor !== null && 'classe' in valor && 'status' in valor

export function paraFalhaEnvio(erro: ErroDaApi): ErroDeEnvio {
  return new ErroDeEnvio(erro.classe, erro.status, erro.classe === 'RECUSA' ? erro.erro : undefined)
}

interface RespostaXhr {
  status: number
  corpo: unknown
}

function enviarUmaVez(caminho: string, arquivo: ArquivoEnvio, onProgresso: (percentual: number) => void): Promise<RespostaXhr> {
  return new Promise((resolver) => {
    const xhr = dependencias.criarXhr()
    xhr.open(arquivo.metodo, caminho)
    xhr.setRequestHeader('Accept', 'application/json')
    const token = lerTokenAcesso()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable && evento.total > 0) onProgresso(Math.round((evento.loaded * 100) / evento.total))
    }
    xhr.onload = () => {
      let corpo: unknown
      try {
        corpo = JSON.parse(xhr.responseText)
      } catch {
        corpo = undefined
      }
      resolver({ status: xhr.status, corpo })
    }
    const semResposta = () => resolver({ status: 0, corpo: undefined })
    xhr.onerror = semResposta
    xhr.ontimeout = semResposta
    xhr.onabort = semResposta
    const formulario = new FormData()
    for (const [nome, valor] of Object.entries(arquivo.campos)) formulario.append(nome, valor)
    formulario.append(arquivo.campoArquivo, arquivo.arquivo, arquivo.nomeArquivo)
    xhr.send(formulario)
  })
}

async function enviarArquivoAutenticado(caminho: string, arquivo: ArquivoEnvio, onProgresso: (percentual: number) => void): Promise<unknown> {
  let resposta = await enviarUmaVez(caminho, arquivo, onProgresso)
  if (resposta.status === 401) {
    try {
      await renovarSessao()
    } catch (erroRefresh) {
      if (erroRefresh instanceof ErroDaApi && erroRefresh.classe !== 'RECUSA') throw paraFalhaEnvio(erroRefresh)
      avisarSeRefreshRecusado(erroRefresh)
      throw paraFalhaEnvio(erroDeResposta(401, resposta.corpo))
    }
    resposta = await enviarUmaVez(caminho, arquivo, onProgresso)
    if (resposta.status === 401) avisarSessaoPerdida()
  }
  if (resposta.status >= 200 && resposta.status < 300) {
    if (resposta.corpo === undefined) throw new ErroDeEnvio('REDE', resposta.status)
    return resposta.corpo
  }
  throw paraFalhaEnvio(erroDeResposta(resposta.status, resposta.corpo))
}

/** Contexto de um item: `aoProgresso` grava o percentual no item, além de repassá-lo ao tipo. */
export function criarContextoEnvio(queryClient: QueryClient, aoProgresso: (percentual: number) => void): ContextoEnvio {
  return {
    queryClient,
    requisitar: async (caminho, opcoes) => {
      try {
        return await requisitarCru(caminho, opcoes)
      } catch (erro) {
        if (erro instanceof ErroDaApi) throw paraFalhaEnvio(erro)
        throw erro
      }
    },
    enviarArquivo: (caminho, arquivo, onProgresso) =>
      enviarArquivoAutenticado(caminho, arquivo, (percentual) => {
        aoProgresso(percentual)
        onProgresso(percentual)
      }),
  }
}
