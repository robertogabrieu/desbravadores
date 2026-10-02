// Primeiro de tudo: o Sentry precisa estar de pé antes de o Nest e o Express serem carregados.
import './instrument'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { configurarApp } from './configurar-app'

async function iniciar(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  configurarApp(app)
  await app.listen(Number(process.env['PORTA_API'] ?? 3001))
}

void iniciar()
