import { Module } from '@nestjs/common'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { UnidadesController } from './unidades.controller'
import { UnidadesService } from './unidades.service'

@Module({
  imports: [DesbravadoresModule],
  controllers: [UnidadesController],
  providers: [UnidadesService],
})
export class UnidadesModule {}
