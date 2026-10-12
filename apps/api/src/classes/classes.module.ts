import { Module } from '@nestjs/common'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import { ClassesController } from './classes.controller'
import { ClassesService } from './classes.service'

@Module({ controllers: [ClassesController], providers: [ClassesService, ServicoEscopo] })
export class ClassesModule {}
