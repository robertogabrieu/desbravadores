import { Module } from '@nestjs/common'
import { ClasseBiblicaModule } from '../classe-biblica/classe-biblica.module'
import { CronogramasModule } from '../cronogramas/cronogramas.module'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { PacoteClasseBiblicaService } from './pacote-classe-biblica.service'
import { PacoteInstrutorService } from './pacote-instrutor.service'
import { SyncController } from './sync.controller'
import { SyncService } from './sync.service'

@Module({
  imports: [ClasseBiblicaModule, CronogramasModule, DesbravadoresModule],
  controllers: [SyncController],
  providers: [SyncService, PacoteInstrutorService, PacoteClasseBiblicaService],
})
export class SyncModule {}
