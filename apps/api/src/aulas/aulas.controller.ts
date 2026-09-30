import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common'
import { AulaEnvio, AulasFiltro, Uuid, type AulaDetalhe, type AulaEnvioSaida, type AulaResumo } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { AulasEnvioService } from './aulas-envio.service'
import { AulasService } from './aulas.service'

const IdDaRota = new ZodValidationPipe(Uuid)

@Controller()
export class AulasController {
  constructor(
    private readonly envio: AulasEnvioService,
    private readonly aulas: AulasService,
  ) {}

  @Pode('aula.registrar')
  @Put('sync/aulas/:uuid')
  enviar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('uuid', IdDaRota) uuid: string,
    @Body(new ZodValidationPipe(AulaEnvio)) corpo: z.infer<typeof AulaEnvio>,
  ): Promise<z.infer<typeof AulaEnvioSaida>> {
    return this.envio.enviar(sessao, uuid, corpo)
  }

  @Pode('aula.registrar')
  @Get('classes/:id/aulas')
  listar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) classeId: string,
    @Query(new ZodValidationPipe(AulasFiltro)) filtro: z.infer<typeof AulasFiltro>,
  ): Promise<z.infer<typeof AulaResumo>[]> {
    return this.aulas.listar(sessao, classeId, filtro.anoClube)
  }

  @Pode('aula.registrar')
  @Get('aulas/:id')
  detalhe(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string): Promise<z.infer<typeof AulaDetalhe>> {
    return this.aulas.detalhe(sessao, id)
  }
}
