import { Module } from '@nestjs/common'
import { CronogramasModule } from '../cronogramas/cronogramas.module'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { PacoteInstrutorService } from './pacote-instrutor.service'
import { SyncController } from './sync.controller'
import { SyncService } from './sync.service'

@Module({
  imports: [CronogramasModule, DesbravadoresModule],
  controllers: [SyncController],
  providers: [SyncService, PacoteInstrutorService],
})
export class SyncModule {}
