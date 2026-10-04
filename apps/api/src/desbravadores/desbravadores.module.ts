import { Module } from '@nestjs/common'
import { CalculoRanking } from '../ranking/calculo-ranking'
import { ServicoClassePelaIdade } from './classe-pela-idade.service'
import { ConviteAcessoController } from './convite-acesso.controller'
import { ConviteAcessoService } from './convite-acesso.service'
import { DesbravadoresController } from './desbravadores.controller'
import { DesbravadoresService } from './desbravadores.service'
import { ServicoEscopo } from './escopo.service'
import { ImportacaoController } from './importacao.controller'
import { ImportacaoService } from './importacao.service'
import { PerfilController } from './perfil.controller'
import { ServicoPerfil } from './perfil.service'
import { TipoDaFichaModule } from './tipo-da-ficha.module'

@Module({
  imports: [TipoDaFichaModule],
  controllers: [ImportacaoController, DesbravadoresController, ConviteAcessoController, PerfilController],
  providers: [
    DesbravadoresService,
    ConviteAcessoService,
    ImportacaoService,
    ServicoEscopo,
    ServicoPerfil,
    CalculoRanking,
    ServicoClassePelaIdade,
  ],
  exports: [ServicoEscopo, ServicoPerfil, ServicoClassePelaIdade],
})
export class DesbravadoresModule {}
