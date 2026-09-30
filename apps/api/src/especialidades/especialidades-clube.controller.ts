import { Body, Controller, Post } from '@nestjs/common'
import { EspecialidadeClubeEntrada } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { EspecialidadesClubeService } from './especialidades-clube.service'

@Controller('especialidades')
export class EspecialidadesClubeController {
  constructor(private readonly especialidadesClube: EspecialidadesClubeService) {}

  @Pode('classe.gerenciar')
  @Post()
  criar(@SessaoDoClube() sessao: SessaoLogada, @Body(new ZodValidationPipe(EspecialidadeClubeEntrada)) entrada: z.infer<typeof EspecialidadeClubeEntrada>) {
    return this.especialidadesClube.criar(sessao.clubeId, entrada)
  }
}
