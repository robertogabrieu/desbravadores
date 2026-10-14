import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { AgendaPublicaController } from './agenda-publica.controller'
import { AgendaPublicaService } from './agenda-publica.service'

@Module({
  imports: [AuthModule],
  controllers: [AgendaPublicaController],
  providers: [AgendaPublicaService],
})
export class AgendaPublicaModule {}
