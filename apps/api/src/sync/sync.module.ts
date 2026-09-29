import { Module } from '@nestjs/common'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { SyncController } from './sync.controller'
import { SyncService } from './sync.service'

@Module({
  imports: [DesbravadoresModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
