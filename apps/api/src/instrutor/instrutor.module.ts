import { Module } from '@nestjs/common'
import { CronogramasModule } from '../cronogramas/cronogramas.module'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { NotificacoesModule } from '../notificacoes/notificacoes.module'
import { ProgressoModule } from '../progresso/progresso.module'
import { InstrutorController } from './instrutor.controller'
import { InstrutorService } from './instrutor.service'

@Module({
  imports: [CronogramasModule, DesbravadoresModule, NotificacoesModule, ProgressoModule],
  controllers: [InstrutorController],
  providers: [InstrutorService],
})
export class InstrutorModule {}
