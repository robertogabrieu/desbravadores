import { Module } from '@nestjs/common'
import { ObservacoesController } from './observacoes.controller'
import { ObservacoesService } from './observacoes.service'

@Module({
  controllers: [ObservacoesController],
  providers: [ObservacoesService],
})
export class ObservacoesModule {}
