import { Catch, PayloadTooLargeException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import type { ErroApi } from '@desbravadores/shared'
import type { z } from 'zod'
import { STATUS_POR_CODIGO } from '../comum/erros'

export const MENSAGEM_FOTO_GRANDE = 'A foto precisa ter até 2 MB.'

/**
 * O limite de tamanho do multer nasce como 413 antes do metodo; a fila do aparelho so entende
 * 422 `REGRA` como recusa, por isso a troca acontece aqui e nao no filtro global.
 */
@Catch(PayloadTooLargeException)
export class FiltroFotoGrande implements ExceptionFilter<PayloadTooLargeException> {
  catch(_erro: PayloadTooLargeException, host: ArgumentsHost): void {
    const corpo: z.infer<typeof ErroApi> = { codigo: 'REGRA', mensagem: MENSAGEM_FOTO_GRANDE }
    host.switchToHttp().getResponse<Response>().status(STATUS_POR_CODIGO.REGRA).json(corpo)
  }
}
