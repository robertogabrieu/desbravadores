import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import { Entrada, LinkPublico } from '@desbravadores/shared'
import request from 'supertest'
import type { z } from 'zod'
import { cookieDoRefresh, criarAppDeAuth } from '../../test/app-auth'
import {
  SENHA_DE_TESTE,
  criarAcesso,
  criarClube,
  criarDbv,
  criarSubstituicao,
  criarUnidade,
  criarUsuario,
  criarVinculo,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp } from '../../test/p6'
import type { Clube, Substituicao } from '../generated/prisma/client.js'
import { gerarTokenOpaco, hashDoToken } from '../sessao/tokens'

const HORA_MS = 60 * 60 * 1000
const CABECALHO_DO_SEGREDO = 'X-Segredo-Aparelho'

let app: INestApplication
const api = clienteHttp(() => app)
const servidor = (): Server => app.getHttpServer() as Server
const ver = (token: string): request.Test => request(servidor()).get(`/api/auth/substituicao/${token}`)
const entrar = (token: string, corpo: object): request.Test => request(servidor()).post(`/api/auth/substituicao/${token}/entrar`).send(corpo)
const lerLink = async (teste: request.Test): Promise<z.infer<typeof LinkPublico>> => LinkPublico.parse((await teste.expect(200)).body)
const lerEntrada = async (teste: request.Test): Promise<z.infer<typeof Entrada>> => Entrada.parse((await teste.expect(200)).body)

interface Cenario {
  clube: Clube
  unidade: { id: string; nome: string }
}

async function cenario(): Promise<Cenario> {
  const clube = await criarClube()
  const unidade = await criarUnidade({ clubeId: clube.id, nome: 'Águias' })
  return { clube, unidade }
}

interface LinkDeTeste {
  substituicao: Substituicao
  token: string
}

/** Link ainda não identificado, aberto agora por padrão; o token conhecido entra como hash. */
async function link(
  c: Cenario,
  dados: { inicioEm?: Date; fimEm?: Date; cancelada?: boolean; aparelhoHash?: string | null; substitutoId?: string | null } = {},
): Promise<LinkDeTeste> {
  const token = gerarTokenOpaco()
  const criada = await criarSubstituicao({
    clubeId: c.clube.id,
    tipo: 'CHAMADA',
    unidadeId: c.unidade.id,
    aparelhoHash: null,
    substitutoId: null,
    ...dados,
  })
  const substituicao = await prismaDeTeste().substituicao.update({ where: { id: criada.id }, data: { tokenHash: hashDoToken(token) } })
  return { substituicao, token }
}

async function usuariosDeSubstituicao(substituicaoId: string): Promise<number> {
  return prismaDeTeste().usuario.count({ where: { email: `substituto-${substituicaoId}@substituto.invalid` } })
}

async function loginComCookie(email: string): Promise<string> {
  const resposta = await request(servidor()).post('/api/auth/login').send({ email, senha: SENHA_DE_TESTE }).expect(200)
  return cookieDoRefresh(resposta)
}

beforeAll(async () => {
  app = await criarAppDeAuth()
})

afterAll(async () => {
  await app.close()
  await desconectarPrismaDeTeste()
})

describe('GET /auth/substituicao/:token — estados na ordem do servidor', () => {
  it('INEXISTENTE: tudo nulo, com o agora do servidor', async () => {
    const antes = Date.now()
    const lido = await lerLink(ver(gerarTokenOpaco()))
    expect(lido).toMatchObject({ estado: 'INEXISTENTE', tipo: null, alvo: null, data: null, inicioEm: null, conta: null, identificado: false })
    expect(Date.parse(lido.agora)).toBeGreaterThanOrEqual(antes - 1000)
  })

  it('CANCELADO vence ENCERRADO; alvo desativado também é CANCELADO', async () => {
    const c = await cenario()
    const cancelado = await link(c, { inicioEm: new Date(Date.now() - 5 * HORA_MS), cancelada: true })
    expect((await lerLink(ver(cancelado.token))).estado).toBe('CANCELADO')

    const aberto = await link(c)
    await prismaDeTeste().unidade.update({ where: { id: c.unidade.id }, data: { ativa: false } })
    expect((await lerLink(ver(aberto.token))).estado).toBe('CANCELADO')
  })

  it('ENCERRADO quando agora ≥ fim, mesmo já identificado em outro aparelho', async () => {
    const c = await cenario()
    const { token } = await link(c, { inicioEm: new Date(Date.now() - 4 * HORA_MS), aparelhoHash: 'outro' })
    expect((await lerLink(ver(token))).estado).toBe('ENCERRADO')
  })

  it('ANTES do início, com alvo, dia e janela', async () => {
    const c = await cenario()
    const inicioEm = new Date(Date.now() + HORA_MS)
    const { substituicao, token } = await link(c, { inicioEm })
    expect(await lerLink(ver(token))).toMatchObject({
      estado: 'ANTES',
      tipo: 'CHAMADA',
      alvo: { nome: 'Águias' },
      data: substituicao.data.toISOString().slice(0, 10),
      inicioEm: inicioEm.toISOString(),
      fimEm: substituicao.fimEm.toISOString(),
      fimEnvioEm: substituicao.fimEnvioEm.toISOString(),
      identificado: false,
    })
  })

  it('EM_OUTRO_APARELHO quando já identificado e o segredo não confere; ABERTO e identificado quando confere', async () => {
    const c = await cenario()
    const segredo = gerarTokenOpaco()
    const { token } = await link(c, { aparelhoHash: hashDoToken(segredo), substitutoId: (await criarUsuario()).id })
    expect((await lerLink(ver(token))).estado).toBe('EM_OUTRO_APARELHO')
    expect((await lerLink(ver(token).set(CABECALHO_DO_SEGREDO, 'errado'))).estado).toBe('EM_OUTRO_APARELHO')
    expect(await lerLink(ver(token).set(CABECALHO_DO_SEGREDO, segredo))).toMatchObject({ estado: 'ABERTO', identificado: true })
  })

  it('ABERTO e ainda não identificado', async () => {
    const c = await cenario()
    const { token } = await link(c)
    expect(await lerLink(ver(token))).toMatchObject({ estado: 'ABERTO', identificado: false, conta: null })
  })
})

describe('POST /auth/substituicao/:token/entrar', () => {
  it('antes da janela é recusado e não cria usuário (critério 7)', async () => {
    const c = await cenario()
    const { substituicao, token } = await link(c, { inicioEm: new Date(Date.now() + HORA_MS) })
    const resposta = await entrar(token, { nome: 'Maria Souza' }).expect(422)
    expect(resposta.body).toMatchObject({ campos: { estado: 'ANTES' } })
    expect(await usuariosDeSubstituicao(substituicao.id)).toBe(0)
  })

  it('cancelado, encerrado e inexistente são recusados', async () => {
    const c = await cenario()
    const cancelado = await link(c, { cancelada: true })
    const encerrado = await link(c, { inicioEm: new Date(Date.now() - 4 * HORA_MS) })
    expect((await entrar(cancelado.token, { nome: 'Maria Souza' }).expect(410)).body).toMatchObject({ campos: { estado: 'CANCELADO' } })
    expect((await entrar(encerrado.token, { nome: 'Maria Souza' }).expect(410)).body).toMatchObject({ campos: { estado: 'ENCERRADO' } })
    expect((await entrar(gerarTokenOpaco(), { nome: 'Maria Souza' }).expect(410)).body).toMatchObject({ campos: { estado: 'INEXISTENTE' } })
  })

  it('S2: cria o usuário de substituição, prende o aparelho e devolve credencial, segredo e identidade', async () => {
    const c = await cenario()
    const { substituicao, token } = await link(c)
    const entrada = await lerEntrada(entrar(token, { nome: '  Maria Souza  ' }))
    expect(entrada.segredo).toEqual(expect.any(String))
    expect(entrada.identidade).toEqual({
      substituicaoId: substituicao.id,
      nome: 'Maria Souza',
      tipo: 'CHAMADA',
      alvoId: c.unidade.id,
      alvoNome: 'Águias',
      clubeId: c.clube.id,
      data: substituicao.data.toISOString().slice(0, 10),
      fimEm: substituicao.fimEm.toISOString(),
      fimEnvioEm: substituicao.fimEnvioEm.toISOString(),
    })

    const gravada = await prismaDeTeste().substituicao.findUniqueOrThrow({ where: { id: substituicao.id } })
    expect(gravada.aparelhoHash).toBe(hashDoToken(entrada.segredo ?? ''))
    expect(gravada.identificadaEm).not.toBeNull()
    const usuario = await prismaDeTeste().usuario.findUniqueOrThrow({ where: { id: gravada.substitutoId ?? '' }, include: { vinculos: true } })
    expect(usuario).toMatchObject({
      nome: 'Maria Souza',
      email: `substituto-${substituicao.id}@substituto.invalid`,
      senhaHash: null,
      status: 'SUBSTITUTO',
      vinculos: [],
    })

    const resposta = await api.get('/api/_teste/pode-ou-substituto', `Bearer ${entrada.credencial}`).expect(200)
    expect(resposta.body).toMatchObject({ usuarioId: usuario.id, clubeId: c.clube.id, papel: 'CONSELHEIRO' })
  })

  it('nome com menos de 3 caracteres depois de aparar é 400; sem nome nem conta também', async () => {
    const c = await cenario()
    const { substituicao, token } = await link(c)
    await entrar(token, { nome: '  Al ' }).expect(400)
    await entrar(token, {}).expect(400)
    expect(await usuariosDeSubstituicao(substituicao.id)).toBe(0)
  })

  it('reingresso com o segredo entra sem criar outro usuário; outro aparelho recebe EM_OUTRO_APARELHO (critério 10)', async () => {
    const c = await cenario()
    const { substituicao, token } = await link(c)
    const primeira = await lerEntrada(entrar(token, { nome: 'Maria Souza' }))
    const reingresso = await lerEntrada(entrar(token, { segredo: primeira.segredo }))
    expect(reingresso.segredo).toBeNull()
    expect(reingresso.identidade.nome).toBe('Maria Souza')
    await api.get('/api/_teste/pode-ou-substituto', `Bearer ${reingresso.credencial}`).expect(200)

    const outro = await entrar(token, { nome: 'João Lima' }).expect(409)
    expect(outro.body).toMatchObject({ campos: { estado: 'EM_OUTRO_APARELHO' } })
    await entrar(token, { segredo: 'nao-confere' }).expect(409)
    expect(await usuariosDeSubstituicao(substituicao.id)).toBe(1)
  })

  it('dois entrar simultâneos: um entra, o outro EM_OUTRO_APARELHO, e só um usuário é criado (critério 10)', async () => {
    const c = await cenario()
    const { substituicao, token } = await link(c)
    const respostas = await Promise.all([entrar(token, { nome: 'Maria Souza' }), entrar(token, { nome: 'João Lima' })])
    expect(respostas.map((r) => r.status).sort()).toEqual([200, 409])
    expect(await usuariosDeSubstituicao(substituicao.id)).toBe(1)
  })
})

describe('conta reconhecida pelo cookie (critério 9)', () => {
  it('conselheiro do mesmo clube: S3 com o nome, entra como ele, e o refresh não rotaciona', async () => {
    const c = await cenario()
    const conta = await criarUsuario({ nome: 'Carlos Dias' })
    await criarVinculo({ usuarioId: conta.id, clubeId: c.clube.id, papel: 'CONSELHEIRO', unidadeIds: [c.unidade.id] })
    const cookie = await loginComCookie(conta.email)
    const tokensAntes = await prismaDeTeste().refreshToken.findMany({ where: { usuarioId: conta.id } })
    const { substituicao, token } = await link(c)

    expect(await lerLink(ver(token).set('Cookie', cookie))).toMatchObject({ estado: 'ABERTO', conta: { nome: 'Carlos Dias' } })
    const entrada = await lerEntrada(entrar(token, { usarConta: true }).set('Cookie', cookie))
    expect(entrada.identidade.nome).toBe('Carlos Dias')
    const gravada = await prismaDeTeste().substituicao.findUniqueOrThrow({ where: { id: substituicao.id } })
    expect(gravada.substitutoId).toBe(conta.id)
    expect(await usuariosDeSubstituicao(substituicao.id)).toBe(0)

    const tokensDepois = await prismaDeTeste().refreshToken.findMany({ where: { usuarioId: conta.id } })
    expect(tokensDepois).toEqual(tokensAntes)
    expect(tokensDepois.every((t) => t.usadoEm === null)).toBe(true)
    await request(servidor()).post('/api/auth/refresh').set('Cookie', cookie).expect(200)
  })

  it('cookie de conta de outro clube conta como sem conta; usarConta é recusado', async () => {
    const c = await cenario()
    const outro = await criarClube()
    const conta = await criarUsuario()
    await criarVinculo({ usuarioId: conta.id, clubeId: outro.id, papel: 'ADM' })
    const cookie = await loginComCookie(conta.email)
    const { substituicao, token } = await link(c)
    expect((await lerLink(ver(token).set('Cookie', cookie))).conta).toBeNull()
    await entrar(token, { usarConta: true }).set('Cookie', cookie).expect(422)
    const gravada = await prismaDeTeste().substituicao.findUniqueOrThrow({ where: { id: substituicao.id } })
    expect(gravada.aparelhoHash).toBeNull()
  })

  it('vínculo inativo no clube ou família revogada contam como sem conta', async () => {
    const c = await cenario()
    const conta = await criarUsuario()
    await criarVinculo({ usuarioId: conta.id, clubeId: c.clube.id, papel: 'INSTRUTOR', ativo: false })
    await criarVinculo({ usuarioId: conta.id, clubeId: (await criarClube()).id, papel: 'ADM' })
    const cookie = await loginComCookie(conta.email)
    const { token } = await link(c)
    expect((await lerLink(ver(token).set('Cookie', cookie))).conta).toBeNull()

    const ativa = await criarUsuario()
    await criarVinculo({ usuarioId: ativa.id, clubeId: c.clube.id, papel: 'CONSELHEIRO' })
    const cookieRevogado = await loginComCookie(ativa.email)
    await prismaDeTeste().refreshToken.updateMany({ where: { usuarioId: ativa.id }, data: { revogadoEm: new Date() } })
    expect((await lerLink(ver(token).set('Cookie', cookieRevogado))).conta).toBeNull()
  })
})

describe('usuário de substituição não vira conta (critério 24)', () => {
  it('fora da lista do Adm, sem login, sem esqueci, POST /usuarios e aceite do convite por link recusados', async () => {
    const c = await cenario()
    const adm = await criarAcesso({ clubeId: c.clube.id, papel: 'ADM' })
    const { substituicao, token } = await link(c)
    await lerEntrada(entrar(token, { nome: 'Maria Souza' }))
    const email = `substituto-${substituicao.id}@substituto.invalid`
    const usuario = await prismaDeTeste().usuario.findUniqueOrThrow({ where: { email } })

    const lista = (await api.get('/api/usuarios?porPagina=100', adm.autorizacao).expect(200)).body as { itens: { id: string }[] }
    expect(lista.itens.map((u) => u.id)).not.toContain(usuario.id)

    await request(servidor()).post('/api/auth/login').send({ email, senha: 'qualquer-coisa-1' }).expect(401)
    await request(servidor()).post('/api/auth/senha/esqueci').send({ email }).expect(204)
    expect(await prismaDeTeste().tokenUsoUnico.count({ where: { usuarioId: usuario.id } })).toBe(0)

    const criar = await api
      .post('/api/usuarios', adm.autorizacao, { nome: 'Maria Souza', email, vinculos: [{ papel: 'CONSELHEIRO', unidadeIds: [c.unidade.id] }] })
      .expect(422)
    expect(criar.body).toMatchObject({ codigo: 'REGRA' })
    expect(await prismaDeTeste().vinculo.count({ where: { usuarioId: usuario.id } })).toBe(0)

    const dbv = await criarDbv({ clubeId: c.clube.id })
    const convite = await api
      .post(`/api/desbravadores/${dbv.id}/convite-acesso`, adm.autorizacao, { papel: 'CONSELHEIRO', unidadeIds: [c.unidade.id] })
      .expect(201)
    const tokenDoConvite = (convite.body as { link: string }).link.split('/acesso/')[1] ?? ''
    const aceite = await request(servidor()).post(`/api/acesso/${tokenDoConvite}`).send({ email, senha: 'SenhaNova@123' }).expect(422)
    expect(aceite.body).toMatchObject({ codigo: 'REGRA' })
    expect(await prismaDeTeste().vinculo.count({ where: { usuarioId: usuario.id } })).toBe(0)
  })
})
