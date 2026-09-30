import { Module } from '@nestjs/common'
import { ArquivosModule } from '../arquivos/arquivos.module'
import { LimpezaDeMateriais } from './limpeza-de-materiais'
import { MateriaisController } from './materiais.controller'
import { MateriaisService } from './materiais.service'

@Module({
  imports: [ArquivosModule],
  controllers: [MateriaisController],
  providers: [MateriaisService, LimpezaDeMateriais],
})
export class MateriaisModule {}
