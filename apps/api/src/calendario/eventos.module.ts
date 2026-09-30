import { Module } from '@nestjs/common'
import { AtividadesModule } from '../atividades/atividades.module'
import { CronogramasModule } from '../cronogramas/cronogramas.module'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { NotificacoesModule } from '../notificacoes/notificacoes.module'
import { EventosController } from './eventos.controller'
import { ServicoEventos } from './servico-eventos'

@Module({
  imports: [AtividadesModule, CronogramasModule, DesbravadoresModule, NotificacoesModule],
  controllers: [EventosController],
  providers: [ServicoEventos],
})
export class EventosModule {}
