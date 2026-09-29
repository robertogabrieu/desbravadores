import { Module } from '@nestjs/common'
import { ArquivosModule } from '../arquivos/arquivos.module'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { FotosController } from './fotos.controller'
import { FotosService } from './fotos.service'
import { LimpezaDeFotos } from './limpeza-de-fotos'

@Module({
  imports: [ArquivosModule, DesbravadoresModule],
  controllers: [FotosController],
  providers: [FotosService, LimpezaDeFotos],
})
export class FotosModule {}
