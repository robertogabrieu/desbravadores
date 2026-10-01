import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { UsuariosModule } from '../usuarios/usuarios.module'
import { AuthController, EuController } from './auth.controller'
import { AuthService } from './auth.service'
import { ConviteAcessoPublicoController } from './convite-acesso-publico.controller'
import { ConviteAcessoPublicoService } from './convite-acesso-publico.service'
import { GuardaLimite, OPCOES_DE_LIMITE } from './limite'

@Module({
  imports: [ThrottlerModule.forRoot(OPCOES_DE_LIMITE), UsuariosModule],
  controllers: [AuthController, EuController, ConviteAcessoPublicoController],
  providers: [AuthService, GuardaLimite, ConviteAcessoPublicoService],
})
export class AuthModule {}
