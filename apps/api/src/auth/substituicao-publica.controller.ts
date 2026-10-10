import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common'
import { CABECALHO_DO_SEGREDO_DO_APARELHO, EntrarNoLink, type Entrada, type LinkPublico } from '@desbravadores/shared'
import type { Request } from 'express'
import { z } from 'zod'
import { Publica } from '../comum/decorators/publica.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { lerCookieDoRefresh } from './cookie-refresh'
import { GuardaLimite, LimitePorLink } from './limite'
import { SubstituicaoPublicaService } from './substituicao-publica.service'

const TokenDaRota = new ZodValidationPipe(z.string().min(20).max(200))

/** O segredo do aparelho só vale com o tamanho que o contrato do corpo aceita; fora disso, é como não ter. */
function segredoDoCabecalho(req: Request): string | undefined {
  const valor = req.header(CABECALHO_DO_SEGREDO_DO_APARELHO)
  return valor && valor.length <= 200 ? valor : undefined
}

/** `/auth/substituicao/:token`: o link de substituição, aberto sem login (sob `/api/auth` chega o cookie de refresh). */
@Controller('auth/substituicao')
export class SubstituicaoPublicaController {
  constructor(private readonly substituicoes: SubstituicaoPublicaService) {}

  @Publica()
  @UseGuards(GuardaLimite)
  @LimitePorLink(30)
  @Get(':token')
  ver(@Param('token', TokenDaRota) token: string, @Req() req: Request): Promise<z.infer<typeof LinkPublico>> {
    return this.substituicoes.ver(token, segredoDoCabecalho(req), lerCookieDoRefresh(req))
  }

  @Publica()
  @UseGuards(GuardaLimite)
  @LimitePorLink(10)
  @HttpCode(200)
  @Post(':token/entrar')
  entrar(
    @Param('token', TokenDaRota) token: string,
    @Body(new ZodValidationPipe(EntrarNoLink)) entrada: z.infer<typeof EntrarNoLink>,
    @Req() req: Request,
  ): Promise<z.infer<typeof Entrada>> {
    return this.substituicoes.entrar(token, entrada, lerCookieDoRefresh(req))
  }
}
