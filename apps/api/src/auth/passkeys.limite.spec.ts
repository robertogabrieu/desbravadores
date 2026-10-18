import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { criarAppDeAuth } from '../../test/app-auth'
import { AutenticadorDeTeste } from '../../test/autenticador'
import { SENHA_DE_TESTE, criarSessao, criarUsuario, desconectarPrismaDeTeste } from '../../test/fabricas'
import { userHandleDe } from './passkeys.config'

let app: INestApplication
let proxyAnterior: string | undefined
const servidor = (): Server => app.getHttpServer() as Server
const ip = (): string => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`

const opcoesDeLogin = (origem: string): request.Test =>
  request(servidor()).post('/api/auth/passkey/login/opcoes').set('X-Forwarded-For', origem)

const loginPorPasskey = (origem: string): request.Test => {
  const aparelho = new AutenticadorDeTeste()
  aparelho.userHandle = userHandleDe(randomUUID())
  return request(servidor())
    .post('/api/auth/passkey/login')
    .set('X-Forwarded-For', origem)
    .send({ desafioId: randomUUID(), resposta: aparelho.assinar({ challenge: 'qualquer' }) })
}

const opcoesDeCadastro = (usuarioId: string, senha: string, origem: string): request.Test =>
  request(servidor())
    .post('/api/eu/passkeys/opcoes')
    .set('Authorization', `Bearer ${criarSessao({ usuarioId, vinculoId: null })}`)
    .set('X-Forwarded-For', origem)
    .send({ senha })

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

describe('limites do login por passkey', () => {
  it('login/opcoes: 60 por minuto por IP (folgado, sem e-mail); a 61a leva 429 e outro IP segue livre', async () => {
    const origem = ip()
    for (let i = 0; i < 60; i++) await opcoesDeLogin(origem).expect(200)
    const bloqueada = await opcoesDeLogin(origem).expect(429)
    expect(bloqueada.body).toMatchObject({ codigo: 'LIMITE_EXCEDIDO' })
    await opcoesDeLogin(ip()).expect(200)
  })

  it('login: 60 por minuto por IP; a 61a leva 429 mesmo com respostas recusadas, e o limite de uma rota nao gasta o da outra', async () => {
    const origem = ip()
    for (let i = 0; i < 60; i++) await loginPorPasskey(origem).expect(401)
    await loginPorPasskey(origem).expect(429)
    await opcoesDeLogin(origem).expect(200)
    await loginPorPasskey(ip()).expect(401)
  })
})

describe('limite do cadastro (confere a senha)', () => {
  it('POST /eu/passkeys/opcoes: 5 por usuario a cada 15 min, de qualquer IP; a 6a leva 429 mesmo com a senha certa', async () => {
    const usuario = await criarUsuario()
    for (let i = 0; i < 5; i++) await opcoesDeCadastro(usuario.id, 'SenhaErrada@1', ip()).expect(422)
    const bloqueada = await opcoesDeCadastro(usuario.id, SENHA_DE_TESTE, ip()).expect(429)
    expect(bloqueada.body).toMatchObject({ codigo: 'LIMITE_EXCEDIDO' })
  })

  it('outro usuario no mesmo IP nao e afetado, e a rota de listar nao tem este limite', async () => {
    const origem = ip()
    const gasto = await criarUsuario()
    for (let i = 0; i < 5; i++) await opcoesDeCadastro(gasto.id, 'SenhaErrada@1', origem).expect(422)
    await opcoesDeCadastro(gasto.id, 'SenhaErrada@1', origem).expect(429)
    await opcoesDeCadastro((await criarUsuario()).id, SENHA_DE_TESTE, origem).expect(200)
    for (let i = 0; i < 7; i++) {
      await request(servidor())
        .get('/api/eu/passkeys')
        .set('Authorization', `Bearer ${criarSessao({ usuarioId: gasto.id, vinculoId: null })}`)
        .expect(200)
    }
  })
})
