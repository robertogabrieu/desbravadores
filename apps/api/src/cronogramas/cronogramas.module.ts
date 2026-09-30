import { Module } from '@nestjs/common'
import { CalendarioModule } from '../calendario/calendario.module'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { CronogramasController } from './cronogramas.controller'
import { ServicoCronograma } from './servico-cronograma'

@Module({
  imports: [CalendarioModule, DesbravadoresModule],
  controllers: [CronogramasController],
  providers: [ServicoCronograma],
  exports: [ServicoCronograma],
})
export class CronogramasModule {}
