import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { desconectarPrismaDeTeste } from '../../test/fabricas'
import { criarAppDeAuth } from '../../test/app-auth'

let app: INestApplication
let proxyAnterior: string | undefined
const servidor = (): Server => app.getHttpServer() as Server
const novoEmail = (): string => `${randomUUID().slice(0, 8)}@exemplo.org`
const ip = (): string => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`

const login = (e: string, xff: string): request.Test =>
  request(servidor()).post('/api/auth/login').set('X-Forwarded-For', xff).send({ email: e, senha: 'qualquer-1' })

beforeAll(async () => {
  proxyAnterior = process.env['TRUST_PROXY']
  process.env['TRUST_PROXY'] = '1'
  app = await criarAppDeAuth({ limitar: true })
})

afterAll(async () => {
  await app.close()
  await desconectarPrismaDeTeste()
  if (proxyAnterior === undefined) delete process.env['TRUST_PROXY']
  else process.env['TRUST_PROXY'] = proxyAnterior
})

describe('limites de taxa', () => {
  it('login: a 6a tentativa no mesmo e-mail em 1 min leva 429, mesmo de IPs diferentes e com caixa diferente', async () => {
    const e = novoEmail()
    for (let i = 0; i < 5; i++) await login(i % 2 ? e.toUpperCase() : e, ip()).expect(401)
    const resposta = await login(e, ip()).expect(429)
    expect(resposta.body).toMatchObject({ codigo: 'LIMITE_EXCEDIDO' })
    await login(novoEmail(), ip()).expect(401)
  })

  it('login: a 21a tentativa do mesmo IP (e-mails diferentes) leva 429 e outro IP segue livre', async () => {
    const origem = ip()
    for (let i = 0; i < 20; i++) await login(novoEmail(), origem).expect(401)
    await login(novoEmail(), origem).expect(429)
    await login(novoEmail(), ip()).expect(401)
  })

  it('o IP vem do X-Forwarded-For com TRUST_PROXY', async () => {
    const a = ip()
    const b = ip()
    for (let i = 0; i < 20; i++) await login(novoEmail(), a).expect(401)
    await login(novoEmail(), a).expect(429)
    await login(novoEmail(), b).expect(401)
  })

  it('esqueci: a 4a solicitacao do mesmo e-mail em 1 h leva 429', async () => {
    const e = novoEmail()
    const enviar = (): request.Test =>
      request(servidor()).post('/api/auth/senha/esqueci').set('X-Forwarded-For', ip()).send({ email: e })
    for (let i = 0; i < 3; i++) await enviar().expect(204)
    await enviar().expect(429)
  })

  it('esqueci: o 11o pedido do mesmo IP leva 429', async () => {
    const origem = ip()
    const enviar = (): request.Test =>
      request(servidor()).post('/api/auth/senha/esqueci').set('X-Forwarded-For', origem).send({ email: novoEmail() })
    for (let i = 0; i < 10; i++) await enviar().expect(204)
    await enviar().expect(429)
  })

  it('aceitar convite e redefinir: o 11o pedido do IP em 1 h leva 429', async () => {
    const corpo = { token: 'x'.repeat(43), senha: 'NovaSenha@99' }
    for (const rota of ['/api/auth/convite/aceitar', '/api/auth/senha/redefinir']) {
      const origem = ip()
      const enviar = (): request.Test => request(servidor()).post(rota).set('X-Forwarded-For', origem).send(corpo)
      for (let i = 0; i < 10; i++) await enviar().expect(410)
      await enviar().expect(429)
    }
  })

  it('aceite do convite por link: a 6a tentativa no mesmo e-mail em 1 min leva 429, mesmo de IPs diferentes', async () => {
    const e = novoEmail()
    const aceitar = (email: string, xff: string): request.Test =>
      request(servidor()).post(`/api/acesso/${'y'.repeat(43)}`).set('X-Forwarded-For', xff).send({ email, senha: 'qualquer-1' })
    for (let i = 0; i < 5; i++) await aceitar(i % 2 ? e.toUpperCase() : e, ip()).expect(410)
    expect((await aceitar(e, ip()).expect(429)).body).toMatchObject({ codigo: 'LIMITE_EXCEDIDO' })
    await aceitar(novoEmail(), ip()).expect(410)

    const origem = ip()
    for (let i = 0; i < 10; i++) await aceitar(novoEmail(), origem).expect(410)
    await aceitar(novoEmail(), origem).expect(429)
  })
})
