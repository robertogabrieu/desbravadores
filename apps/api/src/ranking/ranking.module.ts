import { Module } from '@nestjs/common'
import { EventosModule } from '../calendario/eventos.module'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { CalculoRanking } from './calculo-ranking'
import { RankingController } from './ranking.controller'
import { RankingService } from './ranking.service'
import { RegrasController } from './regras/regras.controller'
import { ServicoRegras } from './regras/regras.service'

@Module({
  imports: [DesbravadoresModule, EventosModule],
  controllers: [RankingController, RegrasController],
  providers: [RankingService, CalculoRanking, ServicoRegras],
})
export class RankingModule {}
