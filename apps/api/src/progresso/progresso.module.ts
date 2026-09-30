import { Module } from '@nestjs/common'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { EspecialidadesDbvController } from '../especialidades/especialidades-dbv.controller'
import { EspecialidadesDbvService } from '../especialidades/especialidades-dbv.service'
import { PontosModule } from '../pontos/pontos.module'
import { ProgressoController } from './progresso.controller'
import { RequisitosDbvService } from './requisitos-dbv.service'
import { ServicoProgresso } from './servico-progresso'

@Module({
  imports: [DesbravadoresModule, PontosModule],
  controllers: [ProgressoController, EspecialidadesDbvController],
  providers: [ServicoProgresso, RequisitosDbvService, EspecialidadesDbvService],
  exports: [ServicoProgresso],
})
export class ProgressoModule {}
