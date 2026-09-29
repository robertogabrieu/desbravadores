import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common'
import { SkipThrottle, Throttle } from '@nestjs/throttler'
import {
  AceitarConviteEntrada,
  EsqueciSenhaEntrada,
  LoginEntrada,
  PapelAtivoEntrada,
  RedefinirSenhaEntrada,
  type SessaoSaida,
} from '@desbravadores/shared'
import type { Request, Response } from 'express'
import type { z } from 'zod'
import { Autenticado } from '../comum/decorators/autenticado.decorator'
import { Publica } from '../comum/decorators/publica.decorator'
import { SessaoAtual, type Sessao } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { AuthService, type SessaoEmitida } from './auth.service'
import { gravarCookieDoRefresh, lerCookieDoRefresh, limparCookieDoRefresh } from './cookie-refresh'
import { GuardaLimite, LIMITE_ESQUECI, LIMITE_LOGIN, LIMITE_POR_IP } from './limite'

type Corpo<T extends z.ZodType> = z.infer<T>

function refreshObrigatorio(req: Request): string {
  const token = lerCookieDoRefresh(req)
  if (!token) throw new ErroApp('NAO_AUTENTICADO', 'Sua sessão expirou. Entre de novo.')
  return token
}

/** Rotas literais; nenhuma tem parametro na URL, entao a ordem nao importa aqui. */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publica()
  @UseGuards(GuardaLimite)
  @Throttle(LIMITE_LOGIN)
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(LoginEntrada)) corpo: Corpo<typeof LoginEntrada>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<z.infer<typeof SessaoSaida>> {
    return this.responder(res, await this.auth.login(corpo, req.headers['user-agent']))
  }

  @Publica()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<z.infer<typeof SessaoSaida>> {
    return this.renovar(req, res)
  }

  @Publica()
  @HttpCode(200)
  @Post('papel-ativo')
  async papelAtivo(
    @Body(new ZodValidationPipe(PapelAtivoEntrada)) corpo: Corpo<typeof PapelAtivoEntrada>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<z.infer<typeof SessaoSaida>> {
    return this.renovar(req, res, corpo.vinculoId)
  }

  @Publica()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(lerCookieDoRefresh(req))
    limparCookieDoRefresh(res)
  }

  @Autenticado()
  @HttpCode(204)
  @Post('sair-de-todos')
  async sairDeTodos(@SessaoAtual() sessao: Sessao, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.sairDeTodos(sessao.usuarioId)
    limparCookieDoRefresh(res)
  }

  @Publica()
  @UseGuards(GuardaLimite)
  @SkipThrottle({ porEmail: true })
  @Throttle(LIMITE_POR_IP)
  @HttpCode(200)
  @Post('convite/aceitar')
  async aceitarConvite(
    @Body(new ZodValidationPipe(AceitarConviteEntrada)) corpo: Corpo<typeof AceitarConviteEntrada>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<z.infer<typeof SessaoSaida>> {
    return this.responder(res, await this.auth.aceitarConvite(corpo, req.headers['user-agent']))
  }

  @Publica()
  @UseGuards(GuardaLimite)
  @Throttle(LIMITE_ESQUECI)
  @HttpCode(204)
  @Post('senha/esqueci')
  async esqueci(@Body(new ZodValidationPipe(EsqueciSenhaEntrada)) corpo: Corpo<typeof EsqueciSenhaEntrada>): Promise<void> {
    await this.auth.esqueciSenha(corpo.email)
  }

  @Publica()
  @UseGuards(GuardaLimite)
  @SkipThrottle({ porEmail: true })
  @Throttle(LIMITE_POR_IP)
  @HttpCode(204)
  @Post('senha/redefinir')
  async redefinir(@Body(new ZodValidationPipe(RedefinirSenhaEntrada)) corpo: Corpo<typeof RedefinirSenhaEntrada>): Promise<void> {
    await this.auth.redefinirSenha(corpo)
  }

  private async renovar(req: Request, res: Response, vinculoId?: string): Promise<z.infer<typeof SessaoSaida>> {
    try {
      return this.responder(res, await this.auth.renovar(refreshObrigatorio(req), vinculoId))
    } catch (erro) {
      if (erro instanceof ErroApp && erro.codigo === 'NAO_AUTENTICADO') limparCookieDoRefresh(res)
      throw erro
    }
  }

  private responder(res: Response, emitida: SessaoEmitida): z.infer<typeof SessaoSaida> {
    gravarCookieDoRefresh(res, emitida.refresh)
    return emitida.saida
  }
}

@Controller('eu')
export class EuController {
  constructor(private readonly auth: AuthService) {}

  @Autenticado()
  @Get()
  eu(@SessaoAtual() sessao: Sessao): ReturnType<AuthService['eu']> {
    return this.auth.eu(sessao)
  }
}
