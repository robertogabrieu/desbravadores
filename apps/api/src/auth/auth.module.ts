import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { UsuariosModule } from '../usuarios/usuarios.module'
import { AuthController, EuController } from './auth.controller'
import { AuthService } from './auth.service'
import { ConviteAcessoPublicoController } from './convite-acesso-publico.controller'
import { ConviteAcessoPublicoService } from './convite-acesso-publico.service'
import { GuardaLimite, OPCOES_DE_LIMITE } from './limite'
import { SubstituicaoPublicaController } from './substituicao-publica.controller'
import { SubstituicaoPublicaService } from './substituicao-publica.service'

@Module({
  imports: [ThrottlerModule.forRoot(OPCOES_DE_LIMITE), UsuariosModule],
  controllers: [AuthController, EuController, ConviteAcessoPublicoController, SubstituicaoPublicaController],
  providers: [AuthService, GuardaLimite, ConviteAcessoPublicoService, SubstituicaoPublicaService],
})
export class AuthModule {}
