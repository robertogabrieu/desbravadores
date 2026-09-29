import { Module } from '@nestjs/common'
import { ArquivosModule } from '../arquivos/arquivos.module'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { PontosModule } from '../pontos/pontos.module'
import { ReunioesController } from './reunioes.controller'
import { ReunioesEnvioService } from './reunioes-envio.service'
import { ReunioesService } from './reunioes.service'

@Module({
  imports: [DesbravadoresModule, PontosModule, ArquivosModule],
  controllers: [ReunioesController],
  providers: [ReunioesEnvioService, ReunioesService],
})
export class ReunioesModule {}
