import { Module } from '@nestjs/common'
import { NotificacoesController } from './notificacoes.controller'
import { NotificacoesService } from './notificacoes.service'
import { ServicoNotificacoes } from './servico-notificacoes'

@Module({
  controllers: [NotificacoesController],
  providers: [NotificacoesService, ServicoNotificacoes],
  exports: [ServicoNotificacoes],
})
export class NotificacoesModule {}
