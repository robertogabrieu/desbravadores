import { Module } from '@nestjs/common'
import { TipoDaFichaModule } from '../desbravadores/tipo-da-ficha.module'
import { TarefasPeriodicas } from './tarefas.service'

@Module({
  imports: [TipoDaFichaModule],
  providers: [TarefasPeriodicas],
})
export class TarefasModule {}
