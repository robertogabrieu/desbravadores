import { Module } from '@nestjs/common'
import { PermissoesController } from './permissoes.controller'

@Module({ controllers: [PermissoesController] })
export class PermissoesModule {}
