import { Module } from '@nestjs/common'
import { AtividadesModule } from '../../atividades/atividades.module'
import { CalendarioModule } from '../../calendario/calendario.module'
import { DesbravadoresModule } from '../../desbravadores/desbravadores.module'
import { NotificacoesModule } from '../../notificacoes/notificacoes.module'
import { CronogramasModule } from '../cronogramas.module'
import { MontagemController } from './montagem.controller'
import { ServicoMontagem } from './servico-montagem'
import { ServicoMontagemLeitura } from './servico-montagem-leitura'

@Module({
  imports: [AtividadesModule, CalendarioModule, CronogramasModule, DesbravadoresModule, NotificacoesModule],
  controllers: [MontagemController],
  providers: [ServicoMontagem, ServicoMontagemLeitura],
  exports: [ServicoMontagem],
})
export class MontagemModule {}
