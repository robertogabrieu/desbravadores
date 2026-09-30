import { Body, Controller, Param, Patch } from '@nestjs/common'
import { ClasseClubeEditarEntrada, RequisitoAjusteEntrada, Uuid } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { AjustesService } from './ajustes.service'

const IdDaRota = new ZodValidationPipe(Uuid)

@Controller()
export class AjustesController {
  constructor(private readonly ajustes: AjustesService) {}

  @Pode('classe.gerenciar')
  @Patch('classes/:id')
  editarClasse(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(ClasseClubeEditarEntrada)) entrada: z.infer<typeof ClasseClubeEditarEntrada>,
  ) {
    return this.ajustes.editarClasse(sessao.clubeId, id, entrada)
  }

  @Pode('classe.gerenciar')
  @Patch('requisitos/:id/ajuste')
  ajustarRequisito(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(RequisitoAjusteEntrada)) entrada: z.infer<typeof RequisitoAjusteEntrada>,
  ) {
    return this.ajustes.ajustarRequisito(sessao.clubeId, id, entrada)
  }
}
