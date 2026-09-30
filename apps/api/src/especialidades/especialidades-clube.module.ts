import { Module } from '@nestjs/common'
import { EspecialidadesClubeController } from './especialidades-clube.controller'
import { EspecialidadesClubeService } from './especialidades-clube.service'
import { EspecialidadesService } from './especialidades.service'

// EspecialidadesModule nao exporta a listagem; a resposta do POST reusa o mesmo servico, com provider proprio.
@Module({ controllers: [EspecialidadesClubeController], providers: [EspecialidadesClubeService, EspecialidadesService] })
export class EspecialidadesClubeModule {}
