import { Module } from '@nestjs/common'
import { CronogramasModule } from '../cronogramas/cronogramas.module'
import { VisaoGeralController } from './visao-geral.controller'
import { VisaoGeralService } from './visao-geral.service'

@Module({ imports: [CronogramasModule], controllers: [VisaoGeralController], providers: [VisaoGeralService] })
export class VisaoGeralModule {}
