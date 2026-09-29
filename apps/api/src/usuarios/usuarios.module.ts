import { Module } from '@nestjs/common'
import { UsuariosController, VinculosController } from './usuarios.controller'
import { UsuariosService } from './usuarios.service'

@Module({
  controllers: [UsuariosController, VinculosController],
  providers: [UsuariosService],
})
export class UsuariosModule {}
