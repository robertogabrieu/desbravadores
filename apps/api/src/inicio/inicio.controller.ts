import { Controller, Get, Query } from '@nestjs/common'
import { InicioConselheiroFiltro } from '@desbravadores/shared'
import type { z } from 'zod'
import { Logado } from '../comum/decorators/logado.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { InicioService } from './inicio.service'

@Controller('inicio')
export class InicioController {
  constructor(private readonly inicio: InicioService) {}

  @Logado()
  @Get('conselheiro')
  conselheiro(
    @SessaoDoClube() sessao: SessaoLogada,
    @Query(new ZodValidationPipe(InicioConselheiroFiltro)) filtro: z.infer<typeof InicioConselheiroFiltro>,
  ) {
    return this.inicio.conselheiro(sessao, filtro)
  }
}
