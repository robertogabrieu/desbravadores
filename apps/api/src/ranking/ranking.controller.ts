import { Controller, Get, Query } from '@nestjs/common'
import { RankingFiltro } from '@desbravadores/shared'
import type { z } from 'zod'
import { Logado } from '../comum/decorators/logado.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { RankingService } from './ranking.service'

const FiltroDasUnidades = RankingFiltro.pick({ mes: true })

@Controller('ranking')
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  @Logado()
  @Get()
  listar(@SessaoDoClube() sessao: SessaoLogada, @Query(new ZodValidationPipe(RankingFiltro)) filtro: z.infer<typeof RankingFiltro>) {
    return this.ranking.ranking(sessao, filtro)
  }

  @Logado()
  @Get('unidades')
  unidades(@SessaoDoClube() sessao: SessaoLogada, @Query(new ZodValidationPipe(FiltroDasUnidades)) filtro: z.infer<typeof FiltroDasUnidades>) {
    return this.ranking.unidades(sessao, filtro.mes)
  }
}
