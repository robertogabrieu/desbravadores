import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common'
import { SkipThrottle, Throttle } from '@nestjs/throttler'
import { AceitarConviteAcessoEntrada, type ConvitePublicoSaida, type SessaoSaida } from '@desbravadores/shared'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { Publica } from '../comum/decorators/publica.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ConviteAcessoPublicoService } from './convite-acesso-publico.service'
import { gravarCookieDoRefresh } from './cookie-refresh'
import { GuardaLimite, LIMITE_LOGIN, LIMITE_POR_IP } from './limite'

const TokenDaRota = new ZodValidationPipe(z.string().min(20).max(200))

/** `/acesso/:token`: o convite por link, aberto sem login. */
@Controller('acesso')
export class ConviteAcessoPublicoController {
  constructor(private readonly convites: ConviteAcessoPublicoService) {}

  @Publica()
  @UseGuards(GuardaLimite)
  @SkipThrottle({ porEmail: true })
  @Throttle(LIMITE_LOGIN)
  @Get(':token')
  ver(@Param('token', TokenDaRota) token: string): Promise<z.infer<typeof ConvitePublicoSaida>> {
    return this.convites.ver(token)
  }

  @Publica()
  @UseGuards(GuardaLimite)
  @SkipThrottle({ porEmail: true })
  @Throttle(LIMITE_POR_IP)
  @HttpCode(200)
  @Post(':token')
  async aceitar(
    @Param('token', TokenDaRota) token: string,
    @Body(new ZodValidationPipe(AceitarConviteAcessoEntrada)) entrada: z.infer<typeof AceitarConviteAcessoEntrada>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<z.infer<typeof SessaoSaida>> {
    const emitida = await this.convites.aceitar(token, entrada, req.headers['user-agent'])
    gravarCookieDoRefresh(res, emitida.refresh)
    return emitida.saida
  }
}
