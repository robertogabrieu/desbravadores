import { HttpException } from '@nestjs/common'
import type { CODIGOS_ERRO } from '@desbravadores/shared'

export type CodigoErro = (typeof CODIGOS_ERRO)[number]

export const STATUS_POR_CODIGO: Record<CodigoErro, number> = {
  VALIDACAO: 400,
  NAO_AUTENTICADO: 401,
  CREDENCIAIS: 401,
  SEM_PERMISSAO: 403,
  VINCULO_INATIVO: 403,
  NAO_ENCONTRADO: 404,
  CONFLITO: 409,
  TOKEN_INVALIDO: 410,
  ULTIMO_ADM: 422,
  AJUSTE_INVALIDO: 422,
  REGRA: 422,
  LIMITE_EXCEDIDO: 429,
  ERRO_INTERNO: 500,
  TEMPORARIO: 503,
}

/** Erro esperado, que vira o `ErroApi` da resposta com o status do codigo. A mensagem vai pronta para a tela. */
export class ErroApp extends HttpException {
  constructor(
    readonly codigo: CodigoErro,
    readonly mensagem: string,
    readonly campos?: Record<string, string>,
  ) {
    super(mensagem, STATUS_POR_CODIGO[codigo])
  }
}
