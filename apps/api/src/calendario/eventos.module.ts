import { Module } from '@nestjs/common'
import { AtividadesModule } from '../atividades/atividades.module'
import { CronogramasModule } from '../cronogramas/cronogramas.module'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { EventosEspeciaisModule } from '../eventos-especiais/eventos-especiais.module'
import { NotificacoesModule } from '../notificacoes/notificacoes.module'
import { EventosController } from './eventos.controller'
import { ServicoEventos } from './servico-eventos'

@Module({
  imports: [AtividadesModule, CronogramasModule, DesbravadoresModule, EventosEspeciaisModule, NotificacoesModule],
  controllers: [EventosController],
  providers: [ServicoEventos],
  exports: [ServicoEventos],
})
export class EventosModule {}
