import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { configurarApp } from './configurar-app'

async function iniciar(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  configurarApp(app)
  await app.listen(Number(process.env['PORTA_API'] ?? 3001))
}

void iniciar()
