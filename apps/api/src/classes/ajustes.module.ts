import { Module } from '@nestjs/common'
import { AjustesController } from './ajustes.controller'
import { AjustesService } from './ajustes.service'
import { ClassesService } from './classes.service'

// ClassesModule nao exporta o servico; o detalhe da classe e lido pelo mesmo codigo, com provider proprio.
@Module({ controllers: [AjustesController], providers: [AjustesService, ClassesService] })
export class AjustesClassesModule {}
