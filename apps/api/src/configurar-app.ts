import type { INestApplication } from '@nestjs/common'

export function configurarApp(app: INestApplication): void {
  app.setGlobalPrefix('api')
}
