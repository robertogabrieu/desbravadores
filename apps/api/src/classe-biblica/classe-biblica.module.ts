import { Module } from '@nestjs/common'
import { ArquivosModule } from '../arquivos/arquivos.module'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { EdicoesController } from './edicoes.controller'
import { ServicoEscopoGrupos } from './escopo-grupos'
import { ServicoEdicoes } from './servico-edicoes'
import { ServicoPainel } from './servico-painel'

@Module({
  imports: [ArquivosModule, DesbravadoresModule],
  controllers: [EdicoesController],
  providers: [ServicoEdicoes, ServicoPainel, ServicoEscopoGrupos],
  exports: [ServicoEscopoGrupos],
})
export class ClasseBiblicaModule {}
