import { Module } from '@nestjs/common'
import { ArquivosModule } from '../arquivos/arquivos.module'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { PontosModule } from '../pontos/pontos.module'
import { ChamadaController } from './chamada.controller'
import { EdicoesController } from './edicoes.controller'
import { EncontrosController } from './encontros.controller'
import { PontosController } from './pontos.controller'
import { ServicoEscopoGrupos } from './escopo-grupos'
import { ServicoChamada } from './servico-chamada'
import { ServicoEdicoes } from './servico-edicoes'
import { ServicoEncontros } from './servico-encontros'
import { ServicoPainel } from './servico-painel'

@Module({
  imports: [ArquivosModule, DesbravadoresModule, PontosModule],
  controllers: [EdicoesController, EncontrosController, ChamadaController, PontosController],
  providers: [ServicoEdicoes, ServicoPainel, ServicoEscopoGrupos, ServicoEncontros, ServicoChamada],
  exports: [ServicoEscopoGrupos],
})
export class ClasseBiblicaModule {}
