import { Module } from '@nestjs/common'
import { CalendarioModule } from '../calendario/calendario.module'
import { SubstituicoesController } from './substituicoes.controller'
import { SubstituicoesService } from './substituicoes.service'

@Module({
  imports: [CalendarioModule],
  controllers: [SubstituicoesController],
  providers: [SubstituicoesService],
})
export class SubstituicoesModule {}
