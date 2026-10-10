import { Body, Controller, Get, Param, Put } from '@nestjs/common'
import { ChamadaCBEnvio, Uuid } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ServicoChamada } from './servico-chamada'

const IdDaRota = new ZodValidationPipe(Uuid)

/** Sem rota de desfazer chamada (regra 10). O escopo do grupo é conferido no serviço: fora dele, 404. */
@Controller()
export class ChamadaController {
  constructor(private readonly chamada: ServicoChamada) {}

  @Pode('classebiblica.chamada')
  @Get('classe-biblica/encontros/:id/grupos/:grupoId/chamada')
  lista(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string, @Param('grupoId', IdDaRota) grupoId: string) {
    return this.chamada.lista(sessao, id, grupoId)
  }

  @Pode('classebiblica.chamada')
  @Put('sync/classe-biblica/encontros/:id/grupos/:grupoId')
  enviar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Param('grupoId', IdDaRota) grupoId: string,
    @Body(new ZodValidationPipe(ChamadaCBEnvio)) envio: z.infer<typeof ChamadaCBEnvio>,
  ) {
    return this.chamada.enviar(sessao, id, grupoId, envio)
  }
}
