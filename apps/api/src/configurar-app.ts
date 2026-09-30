import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'

/**
 * A confirmação da importação manda até 500 linhas de 220 a 330 bytes, e os 100 KB padrão recusam
 * a partir de ~310. Global porque o Nest registra o parser de JSON antes das rotas e não aceita um
 * limite por rota; 2 MB ainda cabe folgado no `client_max_body_size` de 3 MB do nginx.
 */
const LIMITE_DO_CORPO_JSON = '2mb'

// Padrao 2: nginx do host + nginx do container (SPEC 9.1).
const SALTOS_DE_PROXY_PADRAO = 2

export function configurarApp(app: NestExpressApplication): void {
  const saltos = Number(process.env['TRUST_PROXY'] ?? SALTOS_DE_PROXY_PADRAO)
  app.set('trust proxy', Number.isNaN(saltos) ? SALTOS_DE_PROXY_PADRAO : saltos)
  app.setGlobalPrefix('api')
  app.use(helmet())
  app.use(cookieParser())
  app.useBodyParser('json', { limit: LIMITE_DO_CORPO_JSON })
}
