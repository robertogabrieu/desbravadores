import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import type { Response } from 'supertest'
import { AppModule } from '../../app.module'
import { configurarApp } from '../../configurar-app'
import { SERVICO_EMAIL } from '../../email/servico-email'
import { ServicoEmailFalso } from '../../email/servico-email-falso'
import { RotasDeTesteModule } from '../../../test/rotas-de-teste'
import { GuardaLimite } from '../limite'

/** App de teste com as rotas de apoio; o limite de taxa fica desligado, exceto quando `limitar` e verdadeiro. */
export async function criarAppDeAuth(opcoes: { limitar?: boolean } = {}): Promise<INestApplication> {
  let construtor = Test.createTestingModule({ imports: [AppModule, RotasDeTesteModule] })
    .overrideProvider(SERVICO_EMAIL)
    .useValue(new ServicoEmailFalso())
  if (!opcoes.limitar) construtor = construtor.overrideGuard(GuardaLimite).useValue({ canActivate: () => true })
  const modulo = await construtor.compile()
  const app = modulo.createNestApplication<NestExpressApplication>()
  configurarApp(app)
  await app.init()
  return app
}

/** `refresh=<valor>` do Set-Cookie, pronto para o cabecalho Cookie. */
export function cookieDoRefresh(resposta: Response): string {
  const linha = linhaDoSetCookie(resposta)
  if (!linha) throw new Error('resposta sem cookie refresh')
  return linha.split(';')[0] ?? ''
}

export function linhaDoSetCookie(resposta: Response): string {
  const cabecalhos: unknown = resposta.headers['set-cookie']
  const lista = Array.isArray(cabecalhos) ? (cabecalhos as string[]) : []
  return lista.find((c) => c.startsWith('refresh=')) ?? ''
}
