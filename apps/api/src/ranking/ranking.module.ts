import { Module } from '@nestjs/common'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { CalculoRanking } from './calculo-ranking'
import { RankingController } from './ranking.controller'
import { RankingService } from './ranking.service'

@Module({
  imports: [DesbravadoresModule],
  controllers: [RankingController],
  providers: [RankingService, CalculoRanking],
})
export class RankingModule {}
