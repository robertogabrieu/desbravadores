import { Module } from '@nestjs/common'
import { CalculoRanking } from '../ranking/calculo-ranking'
import { DesbravadoresController } from './desbravadores.controller'
import { DesbravadoresService } from './desbravadores.service'
import { ServicoEscopo } from './escopo.service'
import { ImportacaoController } from './importacao.controller'
import { ImportacaoService } from './importacao.service'
import { PerfilController } from './perfil.controller'
import { ServicoPerfil } from './perfil.service'

@Module({
  controllers: [ImportacaoController, DesbravadoresController, PerfilController],
  providers: [DesbravadoresService, ImportacaoService, ServicoEscopo, ServicoPerfil, CalculoRanking],
  exports: [ServicoEscopo, ServicoPerfil],
})
export class DesbravadoresModule {}
