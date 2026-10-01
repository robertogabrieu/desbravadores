import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import type { ErroApi } from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp, STATUS_POR_CODIGO, type CodigoErro } from '../erros'

const MENSAGEM_GENERICA = 'Algo deu errado. Tente de novo em instantes.'

const PADRAO_POR_STATUS: Record<number, { codigo: CodigoErro; mensagem: string }> = {
  400: { codigo: 'VALIDACAO', mensagem: 'Requisição inválida.' },
  401: { codigo: 'NAO_AUTENTICADO', mensagem: 'Você precisa entrar para continuar.' },
  403: { codigo: 'SEM_PERMISSAO', mensagem: 'Você não tem permissão para fazer isso.' },
  404: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado.' },
  409: { codigo: 'CONFLITO', mensagem: 'Já existe um registro igual.' },
  410: { codigo: 'TOKEN_INVALIDO', mensagem: 'Este link já foi usado ou venceu.' },
  422: { codigo: 'REGRA', mensagem: 'Não foi possível concluir.' },
  429: { codigo: 'LIMITE_EXCEDIDO', mensagem: 'Muitas tentativas. Tente de novo em instantes.' },
}

/** O parser de JSON recusa corpo acima do limite com erro próprio, que não é `HttpException`. */
function corpoGrandeDemais(erro: unknown): boolean {
  return typeof erro === 'object' && erro !== null && 'type' in erro && erro.type === 'entity.too.large'
}

/** Converte qualquer excecao em `ErroApi`; o que nao e erro esperado vira 500 generico, com o detalhe so no log. */
@Catch()
export class FiltroErros implements ExceptionFilter<unknown> {
  private readonly logger = new Logger(FiltroErros.name)

  catch(erro: unknown, host: ArgumentsHost): void {
    const resposta = host.switchToHttp().getResponse<Response>()
    const { status, corpo } = this.traduzir(erro)
    resposta.status(status).json(corpo)
  }

  private traduzir(erro: unknown): { status: number; corpo: z.infer<typeof ErroApi> } {
    if (erro instanceof ErroApp) {
      return {
        status: STATUS_POR_CODIGO[erro.codigo],
        corpo: { codigo: erro.codigo, mensagem: erro.mensagem, ...(erro.campos ? { campos: erro.campos } : {}) },
      }
    }
    if (corpoGrandeDemais(erro)) {
      return { status: STATUS_POR_CODIGO.REGRA, corpo: { codigo: 'REGRA', mensagem: 'O envio passou do tamanho permitido.' } }
    }
    if (erro instanceof HttpException && erro.getStatus() < 500) {
      const status = erro.getStatus()
      const padrao = PADRAO_POR_STATUS[status] ?? PADRAO_POR_STATUS[400]
      return { status, corpo: { codigo: padrao?.codigo ?? 'VALIDACAO', mensagem: padrao?.mensagem ?? '' } }
    }
    this.logger.error(erro instanceof Error ? (erro.stack ?? erro.message) : String(erro))
    return { status: 500, corpo: { codigo: 'ERRO_INTERNO', mensagem: MENSAGEM_GENERICA } }
  }
}
