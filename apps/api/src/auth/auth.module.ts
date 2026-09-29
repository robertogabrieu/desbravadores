import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { AuthController, EuController } from './auth.controller'
import { AuthService } from './auth.service'
import { GuardaLimite, OPCOES_DE_LIMITE } from './limite'

@Module({
  imports: [ThrottlerModule.forRoot(OPCOES_DE_LIMITE)],
  controllers: [AuthController, EuController],
  providers: [AuthService, GuardaLimite],
})
export class AuthModule {}
