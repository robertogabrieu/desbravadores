import { Module } from '@nestjs/common'
import { TipoDaFichaModule } from '../desbravadores/tipo-da-ficha.module'
import { UsuariosController, VinculosController } from './usuarios.controller'
import { UsuariosService } from './usuarios.service'

@Module({
  imports: [TipoDaFichaModule],
  controllers: [UsuariosController, VinculosController],
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
