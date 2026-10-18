import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import {
  PasskeyCadastroOpcoesSaida,
  PasskeyListaSaida,
  PasskeyLoginOpcoesSaida,
  PasskeyResumo,
  SessaoSaida,
} from '@desbravadores/shared'
import request from 'supertest'
import type { z } from 'zod'
import { criarAppDeAuth, cookieDoRefresh } from '../../test/app-auth'
import { AutenticadorDeTeste, type OpcoesDeAssinatura } from '../../test/autenticador'
import {
  SENHA_DE_TESTE,
  criarClube,
  criarPasskey,
  criarSessao,
  criarSubstituicao,
  criarUsuario,
  criarVinculo,
  credencialDeSubstituicao,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import type { FinalidadeDesafioPasskey } from '../generated/prisma/client.js'
import { ServicoRefresh } from '../sessao/refresh.service'
import { ServicoSessao } from '../sessao/sessao.service'
import { ServicoTokenUsoUnico } from '../sessao/token-uso-unico.service'
import { origemWebauthn, userHandleDe } from './passkeys.config'

let app: INestApplication
const servidor = (): Server => app.getHttpServer() as Server
const prisma = prismaDeTeste()

type Resposta = ReturnType<AutenticadorDeTeste['assinar']>
type OpcoesDeLogin = z.infer<typeof PasskeyLoginOpcoesSaida>
type OpcoesDeCadastro = z.infer<typeof PasskeyCadastroOpcoesSaida>

const MENSAGEM_RECUSA = 'Não foi possível entrar com a digital. Use sua senha.'

beforeAll(async () => {
  app = await criarAppDeAuth()
})

afterAll(async () => {
  await app.close()
  await desconectarPrismaDeTeste()
})

/** Usuario ativo com vinculo ADM num clube novo e uma passkey cadastrada. */
async function usuarioComPasskey(dados: { contador?: number; revogada?: boolean } = {}) {
  const usuario = await criarUsuario()
  const clube = await criarClube()
  const vinculo = await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'ADM' })
  const passkey = await criarPasskey({
    usuarioId: usuario.id,
    contador: dados.contador,
    revogadaEm: dados.revogada ? new Date() : undefined,
  })
  return { usuario, vinculo, ...passkey }
}

const pedirOpcoesDeLogin = (): request.Test => request(servidor()).post('/api/auth/passkey/login/opcoes')
const entrar = (desafioId: string, resposta: Resposta | Record<string, unknown>): request.Test =>
  request(servidor()).post('/api/auth/passkey/login').send({ desafioId, resposta })

async function novoDesafioDeLogin(): Promise<OpcoesDeLogin> {
  return PasskeyLoginOpcoesSaida.parse((await pedirOpcoesDeLogin().expect(200)).body)
}

/** Pede um desafio e assina com o aparelho: o caminho feliz do login. */
async function entrarCom(autenticador: AutenticadorDeTeste, ajustes?: OpcoesDeAssinatura): Promise<request.Response> {
  const { desafioId, opcoes } = await novoDesafioDeLogin()
  return entrar(desafioId, autenticador.assinar(opcoes, ajustes))
}

/** `entrarCom` ja resolveu a requisicao: confere o status e devolve a resposta. */
function comStatus(resposta: request.Response, status: number): request.Response {
  expect(resposta.status).toBe(status)
  return resposta
}

function recusado(resposta: request.Response): void {
  expect(resposta.status).toBe(401)
  expect(resposta.body).toMatchObject({ codigo: 'CREDENCIAIS', mensagem: MENSAGEM_RECUSA })
}

async function desafioNoBanco(finalidade: FinalidadeDesafioPasskey, usuarioId: string | null, dados: { expiraEm?: Date; usadoEm?: Date } = {}) {
  return prisma.desafioPasskey.create({
    data: { desafio: randomUUID(), finalidade, usuarioId, expiraEm: dados.expiraEm ?? new Date(Date.now() + 60_000), usadoEm: dados.usadoEm ?? null },
  })
}

const autorizacaoDe = (usuarioId: string): string => `Bearer ${criarSessao({ usuarioId, vinculoId: null })}`
const pedirOpcoesDeCadastro = (usuarioId: string, senha: string = SENHA_DE_TESTE): request.Test =>
  request(servidor()).post('/api/eu/passkeys/opcoes').set('Authorization', autorizacaoDe(usuarioId)).send({ senha })
const cadastrarRota = (usuarioId: string, corpo: Record<string, unknown>): request.Test =>
  request(servidor()).post('/api/eu/passkeys').set('Authorization', autorizacaoDe(usuarioId)).send(corpo)
const listarRota = (usuarioId: string): request.Test =>
  request(servidor()).get('/api/eu/passkeys').set('Authorization', autorizacaoDe(usuarioId))
const removerRota = (usuarioId: string, id: string): request.Test =>
  request(servidor()).delete(`/api/eu/passkeys/${id}`).set('Authorization', autorizacaoDe(usuarioId))

async function novoDesafioDeCadastro(usuarioId: string): Promise<OpcoesDeCadastro> {
  return PasskeyCadastroOpcoesSaida.parse((await pedirOpcoesDeCadastro(usuarioId).expect(200)).body)
}

/** Cadastro completo com um aparelho novo; devolve a resposta da rota para o teste conferir. */
async function cadastrarAparelho(usuarioId: string, aparelho = new AutenticadorDeTeste(), nome = 'Chrome no Android') {
  const { desafioId, opcoes } = await novoDesafioDeCadastro(usuarioId)
  return { aparelho, resposta: await cadastrarRota(usuarioId, { desafioId, nome, resposta: aparelho.registrar(opcoes) }) }
}

describe('POST /auth/passkey/login/opcoes', () => {
  it('devolve o desafio exigindo verificacao do usuario, sem lista de credenciais, e o grava como LOGIN', async () => {
    const { desafioId, opcoes } = await novoDesafioDeLogin()
    expect(opcoes.rpId).toBe(origemWebauthn().rpID)
    expect(opcoes.userVerification).toBe('required')
    expect(opcoes.allowCredentials ?? []).toEqual([])
    const linha = await prisma.desafioPasskey.findUniqueOrThrow({ where: { id: desafioId } })
    expect(linha).toMatchObject({ desafio: opcoes.challenge, finalidade: 'LOGIN', usuarioId: null, usadoEm: null })
    const validade = linha.expiraEm.getTime() - Date.now()
    expect(validade).toBeGreaterThan(4 * 60_000)
    expect(validade).toBeLessThanOrEqual(5 * 60_000)
  })

  it('cada pedido apaga os desafios vencidos ha mais de 1 hora e guarda os vencidos mais recentes', async () => {
    const antigo = await desafioNoBanco('LOGIN', null, { expiraEm: new Date(Date.now() - 2 * 3_600_000) })
    const recente = await desafioNoBanco('LOGIN', null, { expiraEm: new Date(Date.now() - 30 * 60_000) })
    await novoDesafioDeLogin()
    expect(await prisma.desafioPasskey.findUnique({ where: { id: antigo.id } })).toBeNull()
    expect(await prisma.desafioPasskey.findUnique({ where: { id: recente.id } })).not.toBeNull()
  })

  it('sem e-mail e sem sessao: e rota publica', async () => {
    await pedirOpcoesDeLogin().send({}).expect(200)
  })
})

describe('POST /auth/passkey/login: tabela de estados', () => {
  it('passkey ativa, conta ATIVA, desafio valido: entra como no login por senha (SessaoSaida, cookie, ultimo acesso, contador)', async () => {
    const { usuario, vinculo, credencial, autenticador } = await usuarioComPasskey()
    const resposta = comStatus(await entrarCom(autenticador), 200)
    const sessao = SessaoSaida.parse(resposta.body)
    expect(sessao.vinculoAtivoId).toBe(vinculo.id)
    const cookie = cookieDoRefresh(resposta)
    expect(cookie).toMatch(/^refresh=.+/)
    const familias = await prisma.refreshToken.count({ where: { usuarioId: usuario.id } })
    expect(familias).toBe(1)
    const depois = await prisma.credencialPasskey.findUniqueOrThrow({ where: { id: credencial.id } })
    expect(depois.contador).toBe(1)
    expect(depois.ultimoUsoEm).not.toBeNull()
    const conta = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })
    expect(conta.ultimoAcessoEm).not.toBeNull()
    // O cookie funciona de verdade: renova a sessao.
    await request(servidor()).post('/api/auth/refresh').set('Cookie', cookie).expect(200)
  })

  it('o login sem e-mail acha a conta pela passkey, mesmo havendo outras contas e passkeys', async () => {
    await usuarioComPasskey()
    const alvo = await usuarioComPasskey()
    const resposta = comStatus(await entrarCom(alvo.autenticador), 200)
    const sessao = SessaoSaida.parse(resposta.body)
    expect(sessao.vinculoAtivoId).toBe(alvo.vinculo.id)
  })

  it('contador zero guardado e zero recebido: aceito (passkey sincronizada)', async () => {
    const { autenticador, credencial } = await usuarioComPasskey({ contador: 0 })
    comStatus(await entrarCom(autenticador, { contador: 0 }), 200)
    comStatus(await entrarCom(autenticador, { contador: 0 }), 200)
    expect((await prisma.credencialPasskey.findUniqueOrThrow({ where: { id: credencial.id } })).contador).toBe(0)
  })

  it('contador guardado maior que zero e recebido que nao o supera: CREDENCIAIS; que o supera: entra', async () => {
    const { autenticador, credencial } = await usuarioComPasskey({ contador: 5 })
    recusado(await entrarCom(autenticador, { contador: 5 }))
    recusado(await entrarCom(autenticador, { contador: 0 }))
    comStatus(await entrarCom(autenticador, { contador: 6 }), 200)
    expect((await prisma.credencialPasskey.findUniqueOrThrow({ where: { id: credencial.id } })).contador).toBe(6)
  })

  it('duas respostas com o mesmo contador, ao mesmo tempo: so uma entra, a outra e CREDENCIAIS', async () => {
    const { autenticador, credencial } = await usuarioComPasskey({ contador: 5 })
    const [a, b] = await Promise.all([entrarCom(autenticador, { contador: 6 }), entrarCom(autenticador, { contador: 6 })])
    expect([a.status, b.status].sort()).toEqual([200, 401])
    expect((await prisma.credencialPasskey.findUniqueOrThrow({ where: { id: credencial.id } })).contador).toBe(6)
  })

  it('desafio ja usado: a segunda entrada com a mesma resposta e CREDENCIAIS', async () => {
    const { autenticador } = await usuarioComPasskey()
    const { desafioId, opcoes } = await novoDesafioDeLogin()
    const resposta = autenticador.assinar(opcoes)
    await entrar(desafioId, resposta).expect(200)
    recusado(await entrar(desafioId, resposta))
  })

  it('desafio vencido ou inexistente: CREDENCIAIS', async () => {
    const { autenticador } = await usuarioComPasskey()
    const { desafioId, opcoes } = await novoDesafioDeLogin()
    await prisma.desafioPasskey.update({ where: { id: desafioId }, data: { expiraEm: new Date(Date.now() - 1000) } })
    recusado(await entrar(desafioId, autenticador.assinar(opcoes)))
    recusado(await entrar(randomUUID(), autenticador.assinar(opcoes)))
  })

  it('desafio de outra finalidade (CADASTRO) nao serve no login e continua aberto', async () => {
    const { autenticador, usuario } = await usuarioComPasskey()
    const { desafioId, opcoes } = await novoDesafioDeCadastro(usuario.id)
    recusado(await entrar(desafioId, autenticador.assinar({ challenge: opcoes.challenge })))
    const linha = await prisma.desafioPasskey.findUniqueOrThrow({ where: { id: desafioId } })
    expect(linha.usadoEm).toBeNull()
  })

  it('passkey revogada: CREDENCIAIS', async () => {
    const { autenticador } = await usuarioComPasskey({ revogada: true })
    recusado(await entrarCom(autenticador))
  })

  it('passkey que nao existe no servidor: CREDENCIAIS', async () => {
    const desconhecido = new AutenticadorDeTeste()
    desconhecido.userHandle = userHandleDe(randomUUID())
    recusado(await entrarCom(desconhecido))
  })

  it.each(['CONVIDADO', 'INATIVO', 'SUBSTITUTO'] as const)('passkey ativa de conta %s: CREDENCIAIS', async (status) => {
    const usuario = await criarUsuario({ status })
    const clube = await criarClube()
    await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'ADM' })
    const { autenticador } = await criarPasskey({ usuarioId: usuario.id })
    recusado(await entrarCom(autenticador))
  })

  it('assinatura invalida: CREDENCIAIS e o desafio fica consumido', async () => {
    const { autenticador } = await usuarioComPasskey()
    const impostor = new AutenticadorDeTeste()
    impostor.userHandle = autenticador.userHandle
    const { desafioId, opcoes } = await novoDesafioDeLogin()
    const falsa = { ...impostor.assinar(opcoes), id: autenticador.id, rawId: autenticador.id }
    recusado(await entrar(desafioId, falsa))
    recusado(await entrar(desafioId, autenticador.assinar(opcoes)))
    const linha = await prisma.desafioPasskey.findUniqueOrThrow({ where: { id: desafioId } })
    expect(linha.usadoEm).not.toBeNull()
  })

  it('userHandle de outra pessoa, ou ausente: CREDENCIAIS', async () => {
    const { autenticador } = await usuarioComPasskey()
    recusado(await entrarCom(autenticador, { userHandle: userHandleDe(randomUUID()) }))
    recusado(await entrarCom(autenticador, { userHandle: null }))
  })

  it('origem diferente da de APP_URL e resposta sem verificacao do usuario: CREDENCIAIS', async () => {
    const { autenticador } = await usuarioComPasskey()
    recusado(await entrarCom(autenticador, { origem: 'https://outro.exemplo.org' }))
    recusado(await entrarCom(autenticador, { semVerificacao: true }))
  })

  it('conta ATIVA sem vinculo ativo responde como o login por senha: 403 VINCULO_INATIVO', async () => {
    const usuario = await criarUsuario()
    const { autenticador } = await criarPasskey({ usuarioId: usuario.id })
    const resposta = comStatus(await entrarCom(autenticador), 403)
    expect(resposta.body).toMatchObject({ codigo: 'VINCULO_INATIVO' })
  })

  it('corpo mal formado: 400', async () => {
    await request(servidor()).post('/api/auth/passkey/login').send({ desafioId: 'x' }).expect(400)
  })
})

describe('POST /eu/passkeys/opcoes', () => {
  it('sem sessao: 401', async () => {
    await request(servidor()).post('/api/eu/passkeys/opcoes').send({ senha: SENHA_DE_TESTE }).expect(401)
  })

  it('senha errada: 422 REGRA "Senha incorreta." (nunca 401) e nenhum desafio criado', async () => {
    const usuario = await criarUsuario()
    const resposta = await pedirOpcoesDeCadastro(usuario.id, 'SenhaErrada@1').expect(422)
    expect(resposta.body).toMatchObject({ codigo: 'REGRA', mensagem: 'Senha incorreta.' })
    expect(await prisma.desafioPasskey.count({ where: { usuarioId: usuario.id } })).toBe(0)
  })

  it('senha certa: passkey encontravel com verificacao obrigatoria, userHandle do usuario e desafio CADASTRO dele', async () => {
    const usuario = await criarUsuario()
    const { desafioId, opcoes } = await novoDesafioDeCadastro(usuario.id)
    expect(opcoes.rp.id).toBe(origemWebauthn().rpID)
    expect(opcoes.user.id).toBe(userHandleDe(usuario.id))
    expect(opcoes.user.name).toBe(usuario.email)
    expect(opcoes.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' })
    const linha = await prisma.desafioPasskey.findUniqueOrThrow({ where: { id: desafioId } })
    expect(linha).toMatchObject({ desafio: opcoes.challenge, finalidade: 'CADASTRO', usuarioId: usuario.id })
  })

  it('exclui da lista as passkeys ativas do usuario e nao as revogadas nem as de outros', async () => {
    const usuario = await criarUsuario()
    const ativa = await criarPasskey({ usuarioId: usuario.id })
    const revogada = await criarPasskey({ usuarioId: usuario.id, revogadaEm: new Date() })
    const dePessoaOutra = await criarPasskey({ usuarioId: (await criarUsuario()).id })
    const { opcoes } = await novoDesafioDeCadastro(usuario.id)
    const ids = (opcoes.excludeCredentials ?? []).map((c) => c.id)
    expect(ids).toEqual([ativa.autenticador.id])
    expect(ids).not.toContain(revogada.autenticador.id)
    expect(ids).not.toContain(dePessoaOutra.autenticador.id)
  })

  it.each(['INATIVO', 'CONVIDADO'] as const)('sessao de conta %s: 401 NAO_AUTENTICADO', async (status) => {
    const usuario = await criarUsuario({ status })
    const resposta = await pedirOpcoesDeCadastro(usuario.id).expect(401)
    expect(resposta.body).toMatchObject({ codigo: 'NAO_AUTENTICADO' })
  })

  it('cada pedido apaga os desafios vencidos ha mais de 1 hora', async () => {
    const usuario = await criarUsuario()
    const antigo = await desafioNoBanco('CADASTRO', usuario.id, { expiraEm: new Date(Date.now() - 3 * 3_600_000) })
    await novoDesafioDeCadastro(usuario.id)
    expect(await prisma.desafioPasskey.findUnique({ where: { id: antigo.id } })).toBeNull()
  })
})

describe('POST /eu/passkeys', () => {
  it('registra a passkey: PasskeyResumo sem chave nem credentialId, e o banco guarda a chave publica em bytes', async () => {
    const usuario = await criarUsuario()
    const { aparelho, resposta } = await cadastrarAparelho(usuario.id, undefined, '  Chrome no Android ')
    expect(resposta.status).toBe(201)
    const resumo = PasskeyResumo.parse(resposta.body)
    expect(resumo).toMatchObject({ nome: 'Chrome no Android', ultimoUsoEm: null })
    expect(Object.keys(resposta.body as object).sort()).toEqual(['criadoEm', 'id', 'nome', 'ultimoUsoEm'])
    const linha = await prisma.credencialPasskey.findUniqueOrThrow({ where: { id: resumo.id } })
    expect(linha).toMatchObject({ usuarioId: usuario.id, credentialId: aparelho.id, contador: 0, revogadaEm: null, transportes: ['internal'] })
    expect(Buffer.from(linha.chavePublica).equals(aparelho.chavePublicaCose())).toBe(true)
  })

  it('o aparelho cadastrado entra no login', async () => {
    const usuario = await criarUsuario()
    await criarVinculo({ usuarioId: usuario.id, clubeId: (await criarClube()).id, papel: 'ADM' })
    const { aparelho } = await cadastrarAparelho(usuario.id)
    comStatus(await entrarCom(aparelho), 200)
  })

  it('nome com mais de 60 caracteres ou vazio: 400', async () => {
    const usuario = await criarUsuario()
    const { desafioId, opcoes } = await novoDesafioDeCadastro(usuario.id)
    const resposta = new AutenticadorDeTeste().registrar(opcoes)
    await cadastrarRota(usuario.id, { desafioId, nome: 'a'.repeat(61), resposta }).expect(400)
    await cadastrarRota(usuario.id, { desafioId, nome: '   ', resposta }).expect(400)
    await cadastrarRota(usuario.id, { desafioId, nome: 'a'.repeat(60), resposta }).expect(201)
  })

  it('desafio ja usado: 410 TOKEN_INVALIDO', async () => {
    const usuario = await criarUsuario()
    const { desafioId, opcoes } = await novoDesafioDeCadastro(usuario.id)
    const corpo = { desafioId, nome: 'A', resposta: new AutenticadorDeTeste().registrar(opcoes) }
    await cadastrarRota(usuario.id, corpo).expect(201)
    const segunda = await cadastrarRota(usuario.id, { ...corpo, resposta: new AutenticadorDeTeste().registrar(opcoes) }).expect(410)
    expect(segunda.body).toMatchObject({ codigo: 'TOKEN_INVALIDO' })
  })

  it('desafio vencido ou inexistente: 410 TOKEN_INVALIDO', async () => {
    const usuario = await criarUsuario()
    const { desafioId, opcoes } = await novoDesafioDeCadastro(usuario.id)
    await prisma.desafioPasskey.update({ where: { id: desafioId }, data: { expiraEm: new Date(Date.now() - 1000) } })
    const resposta = new AutenticadorDeTeste().registrar(opcoes)
    await cadastrarRota(usuario.id, { desafioId, nome: 'A', resposta }).expect(410)
    await cadastrarRota(usuario.id, { desafioId: randomUUID(), nome: 'A', resposta }).expect(410)
  })

  it('desafio de outro usuario: 410 e o desafio dele nao e gasto', async () => {
    const dono = await criarUsuario()
    const intruso = await criarUsuario()
    const { desafioId, opcoes } = await novoDesafioDeCadastro(dono.id)
    const resposta = new AutenticadorDeTeste().registrar(opcoes)
    await cadastrarRota(intruso.id, { desafioId, nome: 'A', resposta }).expect(410)
    expect((await prisma.desafioPasskey.findUniqueOrThrow({ where: { id: desafioId } })).usadoEm).toBeNull()
    await cadastrarRota(dono.id, { desafioId, nome: 'A', resposta }).expect(201)
  })

  it('desafio de outra finalidade (LOGIN): 410', async () => {
    const usuario = await criarUsuario()
    const { desafioId, opcoes } = await novoDesafioDeLogin()
    const resposta = new AutenticadorDeTeste().registrar({ challenge: opcoes.challenge, user: { id: userHandleDe(usuario.id) } })
    await cadastrarRota(usuario.id, { desafioId, nome: 'A', resposta }).expect(410)
  })

  it('credentialId repetido: 409 CONFLITO (nunca 500)', async () => {
    const usuario = await criarUsuario()
    const { aparelho } = await cadastrarAparelho(usuario.id)
    const outra = await criarUsuario()
    const { desafioId, opcoes } = await novoDesafioDeCadastro(outra.id)
    const resposta = await cadastrarRota(outra.id, { desafioId, nome: 'A', resposta: aparelho.registrar(opcoes) }).expect(409)
    expect(resposta.body).toMatchObject({ codigo: 'CONFLITO' })
    expect(await prisma.credencialPasskey.count({ where: { credentialId: aparelho.id } })).toBe(1)
  })

  it('registro invalido (origem errada, sem verificacao do usuario): 422 REGRA, e o desafio fica consumido', async () => {
    const usuario = await criarUsuario()
    const { desafioId, opcoes } = await novoDesafioDeCadastro(usuario.id)
    const aparelho = new AutenticadorDeTeste()
    const errada = await cadastrarRota(usuario.id, { desafioId, nome: 'A', resposta: aparelho.registrar(opcoes, { origem: 'https://outro.exemplo.org' }) }).expect(422)
    expect(errada.body).toMatchObject({ codigo: 'REGRA' })
    await cadastrarRota(usuario.id, { desafioId, nome: 'A', resposta: aparelho.registrar(opcoes) }).expect(410)

    const outro = await novoDesafioDeCadastro(usuario.id)
    const semVerificar = aparelho.registrar(outro.opcoes, { semVerificacao: true })
    await cadastrarRota(usuario.id, { desafioId: outro.desafioId, nome: 'A', resposta: semVerificar }).expect(422)
    expect(await prisma.credencialPasskey.count({ where: { usuarioId: usuario.id } })).toBe(0)
  })

  it('sessao de conta nao ATIVA: 401 NAO_AUTENTICADO e nada gravado', async () => {
    const usuario = await criarUsuario({ status: 'INATIVO' })
    const desafio = await desafioNoBanco('CADASTRO', usuario.id)
    const resposta = new AutenticadorDeTeste().registrar({ challenge: desafio.desafio, user: { id: userHandleDe(usuario.id) } })
    const saida = await cadastrarRota(usuario.id, { desafioId: desafio.id, nome: 'A', resposta }).expect(401)
    expect(saida.body).toMatchObject({ codigo: 'NAO_AUTENTICADO' })
    expect(await prisma.credencialPasskey.count({ where: { usuarioId: usuario.id } })).toBe(0)
  })

  it('sem sessao: 401', async () => {
    await request(servidor()).post('/api/eu/passkeys').send({}).expect(401)
  })
})

describe('GET /eu/passkeys e DELETE /eu/passkeys/:id', () => {
  it('lista so as do usuario da sessao e nao revogadas, sem chave nem credentialId', async () => {
    const usuario = await criarUsuario()
    const primeira = await criarPasskey({ usuarioId: usuario.id, nome: 'Primeira' })
    await criarPasskey({ usuarioId: usuario.id, nome: 'Removida', revogadaEm: new Date() })
    await criarPasskey({ usuarioId: (await criarUsuario()).id, nome: 'De outra pessoa' })
    const resposta = await listarRota(usuario.id).expect(200)
    const lista = PasskeyListaSaida.parse(resposta.body)
    expect(lista.itens.map((i) => i.nome)).toEqual(['Primeira'])
    expect(lista.itens[0]?.id).toBe(primeira.credencial.id)
    expect(Object.keys(lista.itens[0] ?? {}).sort()).toEqual(['criadoEm', 'id', 'nome', 'ultimoUsoEm'])
    const texto = JSON.stringify(resposta.body)
    expect(texto).not.toContain(primeira.autenticador.id)
    expect(texto).not.toMatch(/chavePublica|credentialId/)
  })

  it('lista vazia quando nao ha nenhuma', async () => {
    const resposta = await listarRota((await criarUsuario()).id).expect(200)
    expect(resposta.body).toEqual({ itens: [] })
  })

  it('remover revoga sem apagar a linha, some da lista e a passkey nao loga mais', async () => {
    const { usuario, credencial, autenticador } = await usuarioComPasskey()
    await removerRota(usuario.id, credencial.id).expect(204)
    const linha = await prisma.credencialPasskey.findUniqueOrThrow({ where: { id: credencial.id } })
    expect(linha.revogadaEm).not.toBeNull()
    expect(PasskeyListaSaida.parse((await listarRota(usuario.id).expect(200)).body).itens).toEqual([])
    recusado(await entrarCom(autenticador))
  })

  it('remover a de outra pessoa, uma ja removida ou inexistente: 404; o id fora do formato: 400', async () => {
    const dono = await usuarioComPasskey()
    const outro = await criarUsuario()
    await removerRota(outro.id, dono.credencial.id).expect(404)
    expect((await prisma.credencialPasskey.findUniqueOrThrow({ where: { id: dono.credencial.id } })).revogadaEm).toBeNull()
    await removerRota(dono.usuario.id, dono.credencial.id).expect(204)
    await removerRota(dono.usuario.id, dono.credencial.id).expect(404)
    await removerRota(dono.usuario.id, randomUUID()).expect(404)
    await removerRota(dono.usuario.id, 'nao-e-uuid').expect(400)
  })

  it('sem sessao: 401; a credencial de substituicao nao vale nas rotas /eu (regra 13)', async () => {
    await request(servidor()).get('/api/eu/passkeys').expect(401)
    await request(servidor()).delete(`/api/eu/passkeys/${randomUUID()}`).expect(401)
    const clube = await criarClube()
    const unidade = await prisma.unidade.create({ data: { clubeId: clube.id, nome: 'Unidade X', tipo: 'MISTA' } })
    const substituicao = await criarSubstituicao({ clubeId: clube.id, tipo: 'CHAMADA', unidadeId: unidade.id })
    const { autorizacao } = credencialDeSubstituicao(substituicao)
    await request(servidor()).get('/api/eu/passkeys').set('Authorization', autorizacao).expect(401)
    await request(servidor()).post('/api/eu/passkeys/opcoes').set('Authorization', autorizacao).send({ senha: SENHA_DE_TESTE }).expect(401)
  })

  it('"sair de todos" nao revoga as passkeys', async () => {
    const { usuario } = await usuarioComPasskey()
    await request(servidor()).post('/api/auth/sair-de-todos').set('Authorization', autorizacaoDe(usuario.id)).expect(204)
    expect(PasskeyListaSaida.parse((await listarRota(usuario.id).expect(200)).body).itens).toHaveLength(1)
  })
})

describe('revogacao de passkeys', () => {
  const linhas = (usuarioId: string): Promise<{ revogadaEm: Date | null }[]> =>
    prisma.credencialPasskey.findMany({ where: { usuarioId }, select: { revogadaEm: true } })

  it('redefinir a senha revoga todas as passkeys do usuario e so as dele', async () => {
    const alvo = await usuarioComPasskey()
    await criarPasskey({ usuarioId: alvo.usuario.id })
    const outro = await usuarioComPasskey()
    const token = await app.get(ServicoTokenUsoUnico).gerar(alvo.usuario.id, 'SENHA')
    await request(servidor()).post('/api/auth/senha/redefinir').send({ token, senha: 'OutraSenha@77' }).expect(204)
    const doAlvo = await linhas(alvo.usuario.id)
    expect(doAlvo).toHaveLength(2)
    expect(doAlvo.every((l) => l.revogadaEm !== null)).toBe(true)
    expect((await linhas(outro.usuario.id)).every((l) => l.revogadaEm === null)).toBe(true)
    recusado(await entrarCom(alvo.autenticador))
  })

  it('redefinir com token invalido nao revoga nada', async () => {
    const alvo = await usuarioComPasskey()
    await request(servidor()).post('/api/auth/senha/redefinir').send({ token: 'x'.repeat(30), senha: 'OutraSenha@77' }).expect(410)
    expect((await linhas(alvo.usuario.id)).every((l) => l.revogadaEm === null)).toBe(true)
  })

  it('redefinir a senha e uma transacao so: se revogar as sessoes falha, a senha antiga continua valendo', async () => {
    const alvo = await usuarioComPasskey()
    const antes = (await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.usuario.id } })).senhaHash
    const token = await app.get(ServicoTokenUsoUnico).gerar(alvo.usuario.id, 'SENHA')
    const espiao = jest.spyOn(app.get(ServicoRefresh), 'revogarFamilias').mockRejectedValueOnce(new Error('falha'))
    await request(servidor()).post('/api/auth/senha/redefinir').send({ token, senha: 'OutraSenha@77' }).expect(500)
    espiao.mockRestore()
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.usuario.id } })).senhaHash).toBe(antes)
  })

  describe('desativar a conta (usuarios)', () => {
    async function cenario() {
      const clube = await criarClube()
      const adm = await criarUsuario()
      const vinculoAdm = await criarVinculo({ usuarioId: adm.id, clubeId: clube.id, papel: 'ADM' })
      const autorizacaoAdm = `Bearer ${criarSessao({ usuarioId: adm.id, vinculoId: vinculoAdm.id })}`
      const alvo = await criarUsuario()
      const vinculo = await criarVinculo({ usuarioId: alvo.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      const passkey = await criarPasskey({ usuarioId: alvo.id })
      return { clube, autorizacaoAdm, alvo, vinculo, passkey }
    }

    it('POST /usuarios/:id/desativar revoga as passkeys de quem fica sem acesso, e reativar nao as ressuscita', async () => {
      const { autorizacaoAdm, alvo, vinculo } = await cenario()
      await request(servidor()).post(`/api/usuarios/${alvo.id}/desativar`).set('Authorization', autorizacaoAdm).expect(200)
      expect((await linhas(alvo.id)).every((l) => l.revogadaEm !== null)).toBe(true)
      await request(servidor()).put(`/api/vinculos/${vinculo.id}`).set('Authorization', autorizacaoAdm).send({ ativo: true }).expect(200)
      expect((await linhas(alvo.id)).every((l) => l.revogadaEm !== null)).toBe(true)
    })

    it('PUT /vinculos/:id com ativo=false no ultimo vinculo ativo revoga; com outro vinculo ativo em outro clube, nao', async () => {
      const { autorizacaoAdm, alvo, vinculo, clube } = await cenario()
      const vinculoFora = await criarVinculo({ usuarioId: alvo.id, clubeId: (await criarClube()).id, papel: 'ADM' })
      await request(servidor()).put(`/api/vinculos/${vinculo.id}`).set('Authorization', autorizacaoAdm).send({ ativo: false }).expect(200)
      expect((await linhas(alvo.id)).every((l) => l.revogadaEm === null)).toBe(true)
      expect(clube.id).not.toBe(vinculoFora.clubeId)

      await prisma.vinculo.update({ where: { id: vinculoFora.id }, data: { ativo: false } })
      await request(servidor()).put(`/api/vinculos/${vinculo.id}`).set('Authorization', autorizacaoAdm).send({ ativo: false }).expect(200)
      expect((await linhas(alvo.id)).every((l) => l.revogadaEm !== null)).toBe(true)
    })

    it('a revogacao roda na mesma transacao: se ela falha, os vinculos nao ficam desligados', async () => {
      const { autorizacaoAdm, alvo, vinculo } = await cenario()
      const espiao = jest.spyOn(app.get(ServicoSessao), 'revogarPasskeysSeSemAcesso').mockRejectedValue(new Error('falha'))
      await request(servidor()).post(`/api/usuarios/${alvo.id}/desativar`).set('Authorization', autorizacaoAdm).expect(500)
      await request(servidor()).put(`/api/vinculos/${vinculo.id}`).set('Authorization', autorizacaoAdm).send({ ativo: false }).expect(500)
      espiao.mockRestore()
      expect((await prisma.vinculo.findUniqueOrThrow({ where: { id: vinculo.id } })).ativo).toBe(true)
      expect((await linhas(alvo.id)).every((l) => l.revogadaEm === null)).toBe(true)
    })

    it('desativar quem ainda tem acesso em outro clube preserva as passkeys', async () => {
      const { autorizacaoAdm, alvo } = await cenario()
      await criarVinculo({ usuarioId: alvo.id, clubeId: (await criarClube()).id, papel: 'ADM' })
      await request(servidor()).post(`/api/usuarios/${alvo.id}/desativar`).set('Authorization', autorizacaoAdm).expect(200)
      expect((await linhas(alvo.id)).every((l) => l.revogadaEm === null)).toBe(true)
    })
  })
})
