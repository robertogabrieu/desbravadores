import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'

// Padrao 2: nginx do host + nginx do container (SPEC 9.1).
const SALTOS_DE_PROXY_PADRAO = 2

export function configurarApp(app: NestExpressApplication): void {
  const saltos = Number(process.env['TRUST_PROXY'] ?? SALTOS_DE_PROXY_PADRAO)
  app.set('trust proxy', Number.isNaN(saltos) ? SALTOS_DE_PROXY_PADRAO : saltos)
  app.setGlobalPrefix('api')
  app.use(helmet())
  app.use(cookieParser())
}
