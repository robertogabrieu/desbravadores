import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module'
import { configurarApp } from '../src/configurar-app'

export async function criarAppDeTeste(): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const app = modulo.createNestApplication()
  configurarApp(app)
  await app.init()
  return app
}
