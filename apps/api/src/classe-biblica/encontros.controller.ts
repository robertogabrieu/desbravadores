import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { CancelarEntrada, RemarcarEntrada, Uuid } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ServicoEncontros } from './servico-encontros'

const IdDaRota = new ZodValidationPipe(Uuid)

@Controller('classe-biblica/encontros')
export class EncontrosController {
  constructor(private readonly encontros: ServicoEncontros) {}

  @Pode('classebiblica.gerenciar')
  @Get(':id')
  detalhe(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.encontros.detalhe(sessao, id)
  }

  @Pode('classebiblica.gerenciar')
  @Post(':id/remarcar')
  remarcar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(RemarcarEntrada)) entrada: z.infer<typeof RemarcarEntrada>,
  ) {
    return this.encontros.remarcar(sessao, id, entrada)
  }

  @Pode('classebiblica.gerenciar')
  @Post(':id/cancelar')
  cancelar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(CancelarEntrada)) entrada: z.infer<typeof CancelarEntrada>,
  ) {
    return this.encontros.cancelar(sessao, id, entrada)
  }

  @Pode('classebiblica.gerenciar')
  @Post(':id/desfazer-cancelamento')
  desfazerCancelamento(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.encontros.desfazerCancelamento(sessao, id)
  }
}
