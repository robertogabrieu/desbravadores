import { Module } from '@nestjs/common'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { TipoDaFichaModule } from '../desbravadores/tipo-da-ficha.module'
import { TarefasPeriodicas } from './tarefas.service'

@Module({
  imports: [TipoDaFichaModule, DesbravadoresModule],
  providers: [TarefasPeriodicas],
})
export class TarefasModule {}
