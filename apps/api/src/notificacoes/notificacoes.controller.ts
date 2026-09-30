import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import { Uuid, type NotificacoesSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { Logado } from '../comum/decorators/logado.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { NotificacoesService } from './notificacoes.service'

const IdDaRota = new ZodValidationPipe(Uuid)

/** O sino: cada pessoa so alcanca as notificacoes dela no clube ativo. */
@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly notificacoes: NotificacoesService) {}

  @Logado()
  @Get()
  listar(@SessaoDoClube() sessao: SessaoLogada): Promise<z.infer<typeof NotificacoesSaida>> {
    return this.notificacoes.listar(sessao)
  }

  @Logado()
  @HttpCode(204)
  @Post('lidas')
  marcarTodasLidas(@SessaoDoClube() sessao: SessaoLogada): Promise<void> {
    return this.notificacoes.marcarTodasLidas(sessao)
  }

  @Logado()
  @HttpCode(204)
  @Post(':id/lida')
  marcarLida(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string): Promise<void> {
    return this.notificacoes.marcarLida(sessao, id)
  }
}
