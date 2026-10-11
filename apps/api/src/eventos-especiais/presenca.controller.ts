import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common'
import { ConclusaoEntrada, PresencaDoEventoEntrada, Uuid } from '@desbravadores/shared'
import type { ConclusaoSaida, PresencaDoEventoResposta, PresencaDoEventoSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ServicoPresenca } from './servico-presenca'

const IdDaRota = new ZodValidationPipe(Uuid)

/** Só o Adm (`ranking.lancar_manual`): conselheiro e instrutor recebem 403 antes de o evento ser procurado. */
@Controller('calendario/eventos/:id/presenca')
export class PresencaController {
  constructor(private readonly presenca: ServicoPresenca) {}

  @Pode('ranking.lancar_manual')
  @Get()
  lista(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string): Promise<z.infer<typeof PresencaDoEventoSaida>> {
    return this.presenca.lista(sessao.clubeId, id)
  }

  @Pode('ranking.lancar_manual')
  @Put()
  marcar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(PresencaDoEventoEntrada)) entrada: z.infer<typeof PresencaDoEventoEntrada>,
  ): Promise<z.infer<typeof PresencaDoEventoResposta>> {
    return this.presenca.marcar(sessao, id, entrada)
  }

  @Pode('ranking.lancar_manual')
  @Post('concluir')
  @HttpCode(200)
  concluir(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(ConclusaoEntrada)) entrada: z.infer<typeof ConclusaoEntrada>,
  ): Promise<z.infer<typeof ConclusaoSaida>> {
    return this.presenca.concluir(sessao, id, entrada)
  }
}
