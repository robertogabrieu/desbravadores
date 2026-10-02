import { Module } from '@nestjs/common'
import { AtividadesModule } from '../atividades/atividades.module'
import { CronogramasModule } from '../cronogramas/cronogramas.module'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { PontosModule } from '../pontos/pontos.module'
import { AulasController } from './aulas.controller'
import { AulasEnvioService } from './aulas-envio.service'
import { AulasService } from './aulas.service'
import { TarefasEnvio } from './tarefas-envio'

@Module({
  imports: [AtividadesModule, CronogramasModule, DesbravadoresModule, PontosModule],
  controllers: [AulasController],
  providers: [AulasEnvioService, AulasService, TarefasEnvio],
})
export class AulasModule {}
