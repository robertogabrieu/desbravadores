import { Body, Controller, Get, Patch } from '@nestjs/common'
import { ConfiguracaoClubeEntrada } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ClubeService } from './clube.service'

@Controller('clube/configuracao')
export class ClubeController {
  constructor(private readonly clube: ClubeService) {}

  @Pode('clube.configurar')
  @Get()
  obter(@SessaoDoClube() sessao: SessaoLogada) {
    return this.clube.obter(sessao.clubeId)
  }

  @Pode('clube.configurar')
  @Patch()
  editar(@SessaoDoClube() sessao: SessaoLogada, @Body(new ZodValidationPipe(ConfiguracaoClubeEntrada)) entrada: z.infer<typeof ConfiguracaoClubeEntrada>) {
    return this.clube.editar(sessao.clubeId, entrada)
  }
}
