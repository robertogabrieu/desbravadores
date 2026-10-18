import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common'
import { SkipThrottle, Throttle } from '@nestjs/throttler'
import {
  PasskeyCadastroEntrada,
  PasskeyCadastroOpcoesEntrada,
  Uuid,
  PasskeyLoginEntrada,
  type PasskeyCadastroOpcoesSaida,
  type PasskeyListaSaida,
  type PasskeyLoginOpcoesSaida,
  type PasskeyResumo,
  type SessaoSaida,
} from '@desbravadores/shared'
import type { Request, Response } from 'express'
import type { z } from 'zod'
import { Autenticado } from '../comum/decorators/autenticado.decorator'
import { Publica } from '../comum/decorators/publica.decorator'
import { SessaoAtual, type Sessao } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { gravarCookieDoRefresh } from './cookie-refresh'
import { GuardaLimite, LIMITE_PASSKEY_LOGIN, LIMITE_PASSKEY_OPCOES_DE_CADASTRO, LimitePorUsuario } from './limite'
import { PasskeysService } from './passkeys.service'

type Corpo<T extends z.ZodType> = z.infer<T>

const IdDaRota = new ZodValidationPipe(Uuid)

/** Entrar com digital ou rosto: rotas publicas, sem e-mail, com limite proprio por IP. */
@Controller('auth/passkey')
export class PasskeysPublicasController {
  constructor(private readonly passkeys: PasskeysService) {}

  @Publica()
  @UseGuards(GuardaLimite)
  @SkipThrottle({ porEmail: true })
  @Throttle(LIMITE_PASSKEY_LOGIN)
  @HttpCode(200)
  @Post('login/opcoes')
  opcoesDeLogin(): Promise<z.infer<typeof PasskeyLoginOpcoesSaida>> {
    return this.passkeys.opcoesDeLogin()
  }

  @Publica()
  @UseGuards(GuardaLimite)
  @SkipThrottle({ porEmail: true })
  @Throttle(LIMITE_PASSKEY_LOGIN)
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(PasskeyLoginEntrada)) corpo: Corpo<typeof PasskeyLoginEntrada>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<z.infer<typeof SessaoSaida>> {
    const emitida = await this.passkeys.login(corpo, req.headers['user-agent'])
    gravarCookieDoRefresh(res, emitida.refresh)
    return emitida.saida
  }
}

/** Gerenciar as passkeys da propria conta; tudo filtrado pelo usuario da sessao. */
@Controller('eu/passkeys')
export class PasskeysContaController {
  constructor(private readonly passkeys: PasskeysService) {}

  @Autenticado()
  @UseGuards(GuardaLimite)
  @LimitePorUsuario(LIMITE_PASSKEY_OPCOES_DE_CADASTRO.limite, LIMITE_PASSKEY_OPCOES_DE_CADASTRO.ttl)
  @HttpCode(200)
  @Post('opcoes')
  opcoesDeCadastro(
    @SessaoAtual() sessao: Sessao,
    @Body(new ZodValidationPipe(PasskeyCadastroOpcoesEntrada)) corpo: Corpo<typeof PasskeyCadastroOpcoesEntrada>,
  ): Promise<z.infer<typeof PasskeyCadastroOpcoesSaida>> {
    return this.passkeys.opcoesDeCadastro(sessao.usuarioId, corpo.senha)
  }

  @Autenticado()
  @Post()
  cadastrar(
    @SessaoAtual() sessao: Sessao,
    @Body(new ZodValidationPipe(PasskeyCadastroEntrada)) corpo: Corpo<typeof PasskeyCadastroEntrada>,
  ): Promise<z.infer<typeof PasskeyResumo>> {
    return this.passkeys.cadastrar(sessao.usuarioId, corpo)
  }

  @Autenticado()
  @Get()
  listar(@SessaoAtual() sessao: Sessao): Promise<z.infer<typeof PasskeyListaSaida>> {
    return this.passkeys.listar(sessao.usuarioId)
  }

  @Autenticado()
  @HttpCode(204)
  @Delete(':id')
  remover(@SessaoAtual() sessao: Sessao, @Param('id', IdDaRota) id: string): Promise<void> {
    return this.passkeys.remover(sessao.usuarioId, id)
  }
}
