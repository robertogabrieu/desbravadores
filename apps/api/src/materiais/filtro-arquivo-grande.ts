import { Catch, PayloadTooLargeException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import type { ErroApi } from '@desbravadores/shared'
import type { z } from 'zod'
import { STATUS_POR_CODIGO } from '../comum/erros'

export const MENSAGEM_ARQUIVO_GRANDE = 'O arquivo precisa ter até 20 MB.'

/** O limite do multer nasce como 413 antes do método; a tela só entende 422 `REGRA` como recusa. */
@Catch(PayloadTooLargeException)
export class FiltroArquivoGrande implements ExceptionFilter<PayloadTooLargeException> {
  constructor(private readonly mensagem: string = MENSAGEM_ARQUIVO_GRANDE) {}

  catch(_erro: PayloadTooLargeException, host: ArgumentsHost): void {
    const corpo: z.infer<typeof ErroApi> = { codigo: 'REGRA', mensagem: this.mensagem }
    host.switchToHttp().getResponse<Response>().status(STATUS_POR_CODIGO.REGRA).json(corpo)
  }
}
