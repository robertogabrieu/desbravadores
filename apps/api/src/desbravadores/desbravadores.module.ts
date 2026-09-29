import { Module } from '@nestjs/common'
import { CalculoRanking } from '../ranking/calculo-ranking'
import { DesbravadoresController } from './desbravadores.controller'
import { DesbravadoresService } from './desbravadores.service'
import { ServicoEscopo } from './escopo.service'
import { PerfilController } from './perfil.controller'
import { ServicoPerfil } from './perfil.service'

@Module({
  controllers: [DesbravadoresController, PerfilController],
  providers: [DesbravadoresService, ServicoEscopo, ServicoPerfil, CalculoRanking],
  exports: [ServicoEscopo, ServicoPerfil],
})
export class DesbravadoresModule {}
