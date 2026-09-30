import { Controller, Get, Param, Query } from '@nestjs/common'
import { CronogramaLeituraFiltro, Uuid, type CronogramaLeitura } from '@desbravadores/shared'
import type { z } from 'zod'
import { Logado } from '../comum/decorators/logado.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ServicoCronograma } from './servico-cronograma'

@Controller('classes')
export class CronogramasController {
  constructor(private readonly cronogramas: ServicoCronograma) {}

  @Logado()
  @Get(':id/cronograma')
  leitura(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', new ZodValidationPipe(Uuid)) classeId: string,
    @Query(new ZodValidationPipe(CronogramaLeituraFiltro)) filtro: z.infer<typeof CronogramaLeituraFiltro>,
  ): Promise<z.infer<typeof CronogramaLeitura>> {
    return this.cronogramas.leitura(sessao, classeId, filtro.anoClube)
  }
}
