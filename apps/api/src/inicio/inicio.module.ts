import { Module } from '@nestjs/common'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { CalculoRanking } from '../ranking/calculo-ranking'
import { InicioController } from './inicio.controller'
import { InicioService } from './inicio.service'

@Module({
  imports: [DesbravadoresModule],
  controllers: [InicioController],
  providers: [InicioService, CalculoRanking],
})
export class InicioModule {}
