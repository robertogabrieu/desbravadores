import 'reflect-metadata'
import type { INestApplication, Type } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module'
import { configurarApp } from '../src/configurar-app'
import { SERVICO_EMAIL } from '../src/email/servico-email'
import { ServicoEmailFalso } from '../src/email/servico-email-falso'

interface OpcoesDoApp {
  /** Modulos so de teste (rotas de apoio) somados ao AppModule real. */
  extras?: Type<unknown>[]
}

export async function criarAppDeTeste(opcoes: OpcoesDoApp = {}): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule, ...(opcoes.extras ?? [])] })
    .overrideProvider(SERVICO_EMAIL)
    .useValue(new ServicoEmailFalso())
    .compile()
  const app = modulo.createNestApplication<NestExpressApplication>()
  configurarApp(app)
  await app.init()
  return app
}

export function emailFalso(app: INestApplication): ServicoEmailFalso {
  return app.get<ServicoEmailFalso>(SERVICO_EMAIL)
}
