import { Catch, HttpException, PayloadTooLargeException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import type { ErroApi, ErroDeLinha, ImportacaoRecusada } from '@desbravadores/shared'
import type { z } from 'zod'
import { STATUS_POR_CODIGO } from '../comum/erros'

export const MENSAGEM_PLANILHA_GRANDE = 'A planilha precisa ter até 3 MB.'
export const MENSAGEM_LINHAS_COM_ERRO = 'Há linhas com erro. Nada foi importado: corrija e confirme de novo.'

/** Confirmação recusada inteira: carrega o que corrigir em cada linha. */
export class ErroLinhasDaImportacao extends HttpException {
  constructor(readonly erros: z.infer<typeof ErroDeLinha>[]) {
    super(MENSAGEM_LINHAS_COM_ERRO, STATUS_POR_CODIGO.REGRA)
  }
}

/**
 * O 422 da confirmação leva `erros` por linha, que o `ErroApi` comum não tem; e o limite do multer
 * nasce como 413 antes do método, mas a tela só entende 422 `REGRA` como recusa.
 */
@Catch(ErroLinhasDaImportacao, PayloadTooLargeException)
export class FiltroImportacao implements ExceptionFilter<ErroLinhasDaImportacao | PayloadTooLargeException> {
  catch(erro: ErroLinhasDaImportacao | PayloadTooLargeException, host: ArgumentsHost): void {
    const resposta = host.switchToHttp().getResponse<Response>()
    if (erro instanceof ErroLinhasDaImportacao) {
      const corpo: z.infer<typeof ImportacaoRecusada> = { codigo: 'REGRA', mensagem: MENSAGEM_LINHAS_COM_ERRO, erros: erro.erros }
      resposta.status(STATUS_POR_CODIGO.REGRA).json(corpo)
      return
    }
    const corpo: z.infer<typeof ErroApi> = { codigo: 'REGRA', mensagem: MENSAGEM_PLANILHA_GRANDE }
    resposta.status(STATUS_POR_CODIGO.REGRA).json(corpo)
  }
}
