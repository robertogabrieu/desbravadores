import { Module } from '@nestjs/common'
import { ServicoCalendario } from './servico-calendario'

@Module({
  providers: [ServicoCalendario],
  exports: [ServicoCalendario],
})
export class CalendarioModule {}
