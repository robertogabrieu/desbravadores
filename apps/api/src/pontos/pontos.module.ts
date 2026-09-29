import { Module } from '@nestjs/common'
import { ServicoPontos } from './servico-pontos'

@Module({
  providers: [ServicoPontos],
  exports: [ServicoPontos],
})
export class PontosModule {}
