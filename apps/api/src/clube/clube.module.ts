import { Module } from '@nestjs/common'
import { ClubeController } from './clube.controller'
import { ClubeService } from './clube.service'

@Module({ controllers: [ClubeController], providers: [ClubeService] })
export class ClubeModule {}
