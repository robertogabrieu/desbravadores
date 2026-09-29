import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { criarAppDeTeste } from '../../test/app'

describe('GET /api/saude', () => {
  let app: INestApplication

  const servidor = (): Server => app.getHttpServer() as Server

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
  })

  it('responde 200 com ok e a situacao do banco, sem autenticacao', async () => {
    const resposta = await request(servidor()).get('/api/saude').expect(200)
    expect(resposta.body).toEqual({ ok: true, versao: expect.any(String) as string, banco: true })
  })

  it('nao expoe a rota sem o prefixo /api', async () => {
    await request(servidor()).get('/saude').expect(404)
  })
})
