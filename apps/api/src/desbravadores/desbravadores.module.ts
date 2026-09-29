import { Module } from '@nestjs/common'
import { DesbravadoresController } from './desbravadores.controller'
import { DesbravadoresService } from './desbravadores.service'
import { ServicoEscopo } from './escopo.service'

@Module({
  controllers: [DesbravadoresController],
  providers: [DesbravadoresService, ServicoEscopo],
  exports: [ServicoEscopo],
})
export class DesbravadoresModule {}
