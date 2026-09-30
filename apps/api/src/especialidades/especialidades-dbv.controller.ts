import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common'
import { MarcarConclusaoEntrada, Uuid } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { EspecialidadesDbvService } from './especialidades-dbv.service'

const ParametroUuid = new ZodValidationPipe(Uuid)

@Controller('desbravadores/:id/especialidades')
export class EspecialidadesDbvController {
  constructor(private readonly especialidades: EspecialidadesDbvService) {}

  @Pode('dbv.ver')
  @Get()
  listar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', ParametroUuid) id: string) {
    return this.especialidades.listar(sessao, id)
  }

  @Pode('requisito.marcar')
  @Put(':especialidadeId')
  marcar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', ParametroUuid) id: string,
    @Param('especialidadeId', ParametroUuid) especialidadeId: string,
    @Body(new ZodValidationPipe(MarcarConclusaoEntrada)) entrada: z.infer<typeof MarcarConclusaoEntrada>,
  ) {
    return this.especialidades.marcar(sessao, id, especialidadeId, entrada.concluidoEm)
  }

  @Pode('requisito.marcar')
  @Delete(':especialidadeId')
  desmarcar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', ParametroUuid) id: string,
    @Param('especialidadeId', ParametroUuid) especialidadeId: string,
  ) {
    return this.especialidades.desmarcar(sessao, id, especialidadeId)
  }
}
