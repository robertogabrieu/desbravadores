import { Module } from '@nestjs/common'
import { EspecialidadesController } from './especialidades.controller'
import { EspecialidadesService } from './especialidades.service'

@Module({ controllers: [EspecialidadesController], providers: [EspecialidadesService] })
export class EspecialidadesModule {}
