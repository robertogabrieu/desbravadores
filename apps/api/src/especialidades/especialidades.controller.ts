import { Controller, Get, Query } from '@nestjs/common'
import { EspecialidadeFiltro } from '@desbravadores/shared'
import type { z } from 'zod'
import { Logado } from '../comum/decorators/logado.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { EspecialidadesService } from './especialidades.service'

@Controller('especialidades')
export class EspecialidadesController {
  constructor(private readonly especialidades: EspecialidadesService) {}

  @Logado()
  @Get()
  listar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Query(new ZodValidationPipe(EspecialidadeFiltro)) filtro: z.infer<typeof EspecialidadeFiltro>,
  ) {
    return this.especialidades.listar(sessao.clubeId, filtro)
  }
}
