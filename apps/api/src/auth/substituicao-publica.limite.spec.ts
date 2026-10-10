import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { criarAppDeAuth } from '../../test/app-auth'
import { desconectarPrismaDeTeste } from '../../test/fabricas'
import { gerarTokenOpaco } from '../sessao/tokens'

let app: INestApplication
let proxyAnterior: string | undefined
const servidor = (): Server => app.getHttpServer() as Server
const ip = (): string => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
const ver = (token: string, xff: string): request.Test => request(servidor()).get(`/api/auth/substituicao/${token}`).set('X-Forwarded-For', xff)
const entrar = (token: string, xff: string): request.Test =>
  request(servidor()).post(`/api/auth/substituicao/${token}/entrar`).set('X-Forwarded-For', xff).send({ nome: 'Maria Souza' })

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

describe('limites do link de substituição, por hash do token', () => {
  it('GET: a 31a leitura do mesmo link em 1 min leva 429, de qualquer IP; outro link segue livre', async () => {
    const token = gerarTokenOpaco()
    for (let i = 0; i < 30; i++) await ver(token, ip()).expect(200)
    expect((await ver(token, ip()).expect(429)).body).toMatchObject({ codigo: 'LIMITE_EXCEDIDO' })
    await ver(gerarTokenOpaco(), ip()).expect(200)
  })

  it('GET: o mesmo IP (wi-fi da igreja) abre links diferentes sem esbarrar no limite do login', async () => {
    const origem = ip()
    for (let i = 0; i < 25; i++) await ver(gerarTokenOpaco(), origem).expect(200)
  })

  it('POST entrar: a 11a tentativa no mesmo link em 1 min leva 429; o mesmo IP em outros links segue livre', async () => {
    const token = gerarTokenOpaco()
    const origem = ip()
    for (let i = 0; i < 10; i++) await entrar(token, ip()).expect(410)
    await entrar(token, ip()).expect(429)
    for (let i = 0; i < 12; i++) await entrar(gerarTokenOpaco(), origem).expect(410)
  })

  it('o login segue com o limite dele', async () => {
    const email = `${gerarTokenOpaco().slice(0, 8).toLowerCase()}@exemplo.org`
    for (let i = 0; i < 5; i++) await request(servidor()).post('/api/auth/login').set('X-Forwarded-For', ip()).send({ email, senha: 'qualquer-1' }).expect(401)
    await request(servidor()).post('/api/auth/login').set('X-Forwarded-For', ip()).send({ email, senha: 'qualquer-1' }).expect(429)
  })
})
