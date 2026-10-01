import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import {
  ConviteAcessoGeradoSaida,
  ConvitePublicoSaida,
  SessaoSaida,
  SituacaoAcessoSaida,
} from '@desbravadores/shared'
import request from 'supertest'
import type { z } from 'zod'
import { cookieDoRefresh, criarAppDeAuth } from '../../test/app-auth'
import {
  SENHA_DE_TESTE,
  classeOficial,
  criarAcesso,
  criarClube,
  criarDbv,
  criarUnidade,
  criarUsuario,
  criarVinculo,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { clienteHttp, corpo, criarClasseDoClube } from '../../test/p6'
import type { Clube } from '../generated/prisma/client.js'
import { hashDoToken } from '../sessao/tokens'

type Gerado = z.infer<typeof ConviteAcessoGeradoSaida>
type Situacao = z.infer<typeof SituacaoAcessoSaida>

const DIA_MS = 24 * 60 * 60 * 1000
const SENHA_NOVA = 'SenhaNova@123'

let app: INestApplication
const api = clienteHttp(() => app)
const servidor = (): Server => app.getHttpServer() as Server
const verPublico = (token: string): request.Test => request(servidor()).get(`/api/acesso/${token}`)
const aceitar = (token: string, email: string, senha = SENHA_NOVA): request.Test =>
  request(servidor()).post(`/api/acesso/${token}`).send({ email, senha })
const apagar = (url: string, auth: string): request.Test => request(servidor()).delete(url).set('Authorization', auth)
const login = (email: string, senha: string): request.Test =>
  request(servidor()).post('/api/auth/login').send({ email, senha })

const tokenDoLink = (link: string): string => link.split('/acesso/')[1] ?? ''
let sequencia = 0
const emailNovo = (): string => `convidado.${Date.now()}.${++sequencia}@exemplo.org`

interface Cenario {
  clube: Clube
  adm: Awaited<ReturnType<typeof criarAcesso>>
  unidade: { id: string; nome: string }
  dbv: { id: string; nome: string }
}

async function cenario(): Promise<Cenario> {
  const clube = await criarClube()
  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
  const unidade = await criarUnidade({ clubeId: clube.id })
  const dbv = await criarDbv({ clubeId: clube.id, nome: 'Paulo Henrique Souza', sexo: 'M', nascimento: '2008-04-02' })
  return { clube, adm, unidade, dbv }
}

async function gerar(c: Cenario, corpoDoConvite: object = { papel: 'CONSELHEIRO', unidadeIds: [c.unidade.id] }): Promise<Gerado> {
  const resposta = await api.post(`/api/desbravadores/${c.dbv.id}/convite-acesso`, c.adm.autorizacao, corpoDoConvite).expect(201)
  return ConviteAcessoGeradoSaida.parse(resposta.body)
}

beforeAll(async () => {
  app = await criarAppDeAuth()
})

afterAll(async () => {
  await app.close()
  await desconectarPrismaDeTeste()
})

describe('Adm gera o convite de acesso na ficha', () => {
  it('conselheiro: devolve o link montado com APP_URL, 7 dias, o papel e as unidades; o banco guarda so o hash', async () => {
    const c = await cenario()
    const antes = Date.now()
    const gerado = await gerar(c)
    expect(gerado.link.startsWith(`${(process.env['APP_URL'] ?? '').replace(/\/+$/, '')}/acesso/`)).toBe(true)
    expect(gerado).toMatchObject({ papel: 'CONSELHEIRO', unidades: [{ id: c.unidade.id, nome: c.unidade.nome }], classes: [] })
    const validade = new Date(gerado.expiraEm).getTime() - antes
    expect(validade).toBeGreaterThan(7 * DIA_MS - 60_000)
    expect(validade).toBeLessThanOrEqual(7 * DIA_MS + 60_000)

    const token = tokenDoLink(gerado.link)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    const linha = await prismaDeTeste().conviteAcesso.findFirstOrThrow({ where: { clubeId: c.clube.id, dbvId: c.dbv.id } })
    expect(linha.tokenHash).toBe(hashDoToken(token))
    expect(JSON.stringify(linha)).not.toContain(token)
    expect(linha.criadoPorId).toBe(c.adm.usuario.id)
  })

  it('instrutor: devolve as classes escolhidas (oficial e do clube)', async () => {
    const c = await cenario()
    const amigo = await classeOficial('Amigo')
    const doClube = await criarClasseDoClube(c.clube.id, 'Classe Própria')
    const gerado = await gerar(c, { papel: 'INSTRUTOR', classeIds: [amigo.id, doClube.id] })
    expect(gerado.papel).toBe('INSTRUTOR')
    expect(gerado.unidades).toEqual([])
    expect(gerado.classes.map((classe) => classe.id).sort()).toEqual([amigo.id, doClube.id].sort())
  })

  it('GET mostra o convite aberto (sem o link, que nao fica guardado) e nenhum quando nao ha', async () => {
    const c = await cenario()
    const vazio = corpo<Situacao>(await api.get(`/api/desbravadores/${c.dbv.id}/convite-acesso`, c.adm.autorizacao).expect(200))
    expect(SituacaoAcessoSaida.parse(vazio)).toEqual({ convite: null, conta: null })

    const gerado = await gerar(c)
    const aberto = SituacaoAcessoSaida.parse(
      (await api.get(`/api/desbravadores/${c.dbv.id}/convite-acesso`, c.adm.autorizacao).expect(200)).body,
    )
    expect(aberto.conta).toBeNull()
    expect(aberto.convite).toMatchObject({ link: null, papel: 'CONSELHEIRO', expiraEm: gerado.expiraEm })
    expect(aberto.convite?.unidades).toEqual([{ id: c.unidade.id, nome: c.unidade.nome }])
  })

  it('gerar de novo invalida o convite aberto da mesma ficha', async () => {
    const c = await cenario()
    const primeiro = tokenDoLink((await gerar(c)).link)
    const segundo = tokenDoLink((await gerar(c)).link)
    expect((await verPublico(primeiro).expect(410)).body).toMatchObject({ codigo: 'TOKEN_INVALIDO' })
    await verPublico(segundo).expect(200)
  })

  it('cancelar: 204, a ficha fica sem convite e o link deixa de valer', async () => {
    const c = await cenario()
    const token = tokenDoLink((await gerar(c)).link)
    await apagar(`/api/desbravadores/${c.dbv.id}/convite-acesso`, c.adm.autorizacao).expect(204)
    const situacao = corpo<Situacao>(await api.get(`/api/desbravadores/${c.dbv.id}/convite-acesso`, c.adm.autorizacao).expect(200))
    expect(situacao.convite).toBeNull()
    await verPublico(token).expect(410)
    await aceitar(token, emailNovo()).expect(410)
  })

  it('ficha ja ligada a uma conta: nao gera (422) e o GET mostra a conta com os papeis', async () => {
    const c = await cenario()
    const usuario = await criarUsuario()
    await criarVinculo({ usuarioId: usuario.id, clubeId: c.clube.id, papel: 'CONSELHEIRO' })
    await prismaDeTeste().desbravador.update({ where: { id: c.dbv.id }, data: { usuarioId: usuario.id } })
    const recusa = await api
      .post(`/api/desbravadores/${c.dbv.id}/convite-acesso`, c.adm.autorizacao, { papel: 'CONSELHEIRO', unidadeIds: [c.unidade.id] })
      .expect(422)
    expect(recusa.body).toMatchObject({ codigo: 'REGRA' })
    const situacao = corpo<Situacao>(await api.get(`/api/desbravadores/${c.dbv.id}/convite-acesso`, c.adm.autorizacao).expect(200))
    expect(situacao).toEqual({ convite: null, conta: { email: usuario.email, papeis: ['CONSELHEIRO'] } })
  })

  it('papel fora do convite (ADM) ou sem unidade: 400; unidade ou classe de outro clube, ou unidade inativa: 404', async () => {
    const c = await cenario()
    const outro = await criarClube()
    const unidadeFora = await criarUnidade({ clubeId: outro.id })
    const classeFora = await criarClasseDoClube(outro.id)
    const inativa = await criarUnidade({ clubeId: c.clube.id })
    await prismaDeTeste().unidade.update({ where: { id: inativa.id }, data: { ativa: false } })
    const url = `/api/desbravadores/${c.dbv.id}/convite-acesso`
    await api.post(url, c.adm.autorizacao, { papel: 'ADM', unidadeIds: [c.unidade.id] }).expect(400)
    await api.post(url, c.adm.autorizacao, { papel: 'CONSELHEIRO', unidadeIds: [] }).expect(400)
    for (const corpoInvalido of [
      { papel: 'CONSELHEIRO', unidadeIds: [unidadeFora.id] },
      { papel: 'CONSELHEIRO', unidadeIds: [inativa.id] },
      { papel: 'INSTRUTOR', classeIds: [classeFora.id] },
    ]) {
      expect((await api.post(url, c.adm.autorizacao, corpoInvalido).expect(404)).body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
    }
    expect(await prismaDeTeste().conviteAcesso.count({ where: { clubeId: c.clube.id } })).toBe(0)
  })

  it('sem usuario.gerenciar (conselheiro): 403 em gerar, ver e cancelar', async () => {
    const c = await cenario()
    const cons = await criarAcesso({ clubeId: c.clube.id, papel: 'CONSELHEIRO', unidadeIds: [c.unidade.id] })
    const url = `/api/desbravadores/${c.dbv.id}/convite-acesso`
    await api.post(url, cons.autorizacao, { papel: 'CONSELHEIRO', unidadeIds: [c.unidade.id] }).expect(403)
    await api.get(url, cons.autorizacao).expect(403)
    await apagar(url, cons.autorizacao).expect(403)
  })
})

describe('convidado abre e aceita o link', () => {
  it('GET publico mostra clube, nome, papel e unidades', async () => {
    const c = await cenario()
    const token = tokenDoLink((await gerar(c)).link)
    const publico = ConvitePublicoSaida.parse((await verPublico(token).expect(200)).body)
    expect(publico).toEqual({
      clube: c.clube.nome,
      nome: c.dbv.nome,
      papel: 'CONSELHEIRO',
      unidades: [{ id: c.unidade.id, nome: c.unidade.nome }],
      classes: [],
    })
  })

  it('e-mail novo: cria conta ativa com nome e genero da ficha, vinculo, liga a ficha, marca usado e entra logado', async () => {
    const c = await cenario()
    const token = tokenDoLink((await gerar(c)).link)
    const email = emailNovo()
    const resposta = await aceitar(token, email.toUpperCase()).expect(200)
    const sessao = SessaoSaida.parse(resposta.body)
    cookieDoRefresh(resposta)

    const prisma = prismaDeTeste()
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email } })
    expect(usuario).toMatchObject({ nome: c.dbv.nome, genero: 'M', status: 'ATIVO' })
    const vinculo = await prisma.vinculo.findFirstOrThrow({
      where: { clubeId: c.clube.id, usuarioId: usuario.id },
      include: { unidades: true },
    })
    expect(vinculo).toMatchObject({ papel: 'CONSELHEIRO', ativo: true })
    expect(vinculo.unidades.map((u) => u.unidadeId)).toEqual([c.unidade.id])
    expect(sessao.vinculos.map((v) => v.id)).toContain(vinculo.id)
    const ficha = await prisma.desbravador.findUniqueOrThrow({ where: { id: c.dbv.id } })
    expect(ficha.usuarioId).toBe(usuario.id)
    expect(ficha.tipo).toBe('DBV')
    const convite = await prisma.conviteAcesso.findFirstOrThrow({ where: { clubeId: c.clube.id, dbvId: c.dbv.id } })
    expect(convite.usadoEm).not.toBeNull()
    await login(email, SENHA_NOVA).expect(200)

    expect((await aceitar(token, emailNovo()).expect(410)).body).toMatchObject({ codigo: 'TOKEN_INVALIDO' })
  })

  it('instrutor: o vinculo nasce com as classes do convite', async () => {
    const c = await cenario()
    const amigo = await classeOficial('Amigo')
    const token = tokenDoLink((await gerar(c, { papel: 'INSTRUTOR', classeIds: [amigo.id] })).link)
    const email = emailNovo()
    await aceitar(token, email).expect(200)
    const usuario = await prismaDeTeste().usuario.findUniqueOrThrow({ where: { email } })
    const vinculo = await prismaDeTeste().vinculo.findFirstOrThrow({
      where: { clubeId: c.clube.id, usuarioId: usuario.id },
      include: { classes: true },
    })
    expect(vinculo.papel).toBe('INSTRUTOR')
    expect(vinculo.classes.map((v) => v.classeId)).toEqual([amigo.id])
  })

  it('e-mail novo com senha fora da regra: 400 e nada criado', async () => {
    const c = await cenario()
    const token = tokenDoLink((await gerar(c)).link)
    const email = emailNovo()
    await aceitar(token, email, 'curta').expect(400)
    expect(await prismaDeTeste().usuario.count({ where: { email } })).toBe(0)
    await verPublico(token).expect(200)
  })

  it('e-mail que ja tem conta (outro clube) com a senha certa: o acesso entra na mesma conta', async () => {
    const c = await cenario()
    const outroClube = await criarClube()
    const existente = await criarUsuario({ nome: 'Nome Da Conta', genero: 'F' })
    await criarVinculo({ usuarioId: existente.id, clubeId: outroClube.id, papel: 'ADM' })
    const token = tokenDoLink((await gerar(c)).link)
    const resposta = await aceitar(token, existente.email, SENHA_DE_TESTE).expect(200)
    SessaoSaida.parse(resposta.body)

    const prisma = prismaDeTeste()
    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: existente.id } })
    expect(depois).toMatchObject({ nome: 'Nome Da Conta', genero: 'F', senhaHash: existente.senhaHash })
    expect(await prisma.vinculo.count({ where: { usuarioId: existente.id } })).toBe(2)
    expect((await prisma.desbravador.findUniqueOrThrow({ where: { id: c.dbv.id } })).usuarioId).toBe(existente.id)
  })

  it('e-mail que ja tem conta com a senha errada: 409 CONTA_EXISTENTE e o convite continua valendo', async () => {
    const c = await cenario()
    const existente = await criarUsuario()
    const token = tokenDoLink((await gerar(c)).link)
    const resposta = await aceitar(token, existente.email, 'senha-que-nao-e').expect(409)
    expect(resposta.body).toMatchObject({ codigo: 'CONTA_EXISTENTE' })
    const prisma = prismaDeTeste()
    expect(await prisma.vinculo.count({ where: { usuarioId: existente.id } })).toBe(0)
    expect((await prisma.desbravador.findUniqueOrThrow({ where: { id: c.dbv.id } })).usuarioId).toBeNull()
    await verPublico(token).expect(200)
  })

  it('token vencido, cancelado ou inexistente: 410 no GET e no POST', async () => {
    const c = await cenario()
    const vencido = tokenDoLink((await gerar(c)).link)
    await prismaDeTeste().conviteAcesso.updateMany({
      where: { clubeId: c.clube.id, dbvId: c.dbv.id },
      data: { expiraEm: new Date(Date.now() - 1000) },
    })
    for (const token of [vencido, 'token-que-nunca-existiu-no-banco-de-teste']) {
      expect((await verPublico(token).expect(410)).body).toMatchObject({ codigo: 'TOKEN_INVALIDO' })
      await aceitar(token, emailNovo()).expect(410)
    }
  })

  it('conta ja ligada a outra ficha do mesmo clube: 422 com a mensagem da SPEC', async () => {
    const c = await cenario()
    const existente = await criarUsuario()
    await criarVinculo({ usuarioId: existente.id, clubeId: c.clube.id, papel: 'INSTRUTOR' })
    await criarDbv({ clubeId: c.clube.id, usuarioId: existente.id })
    const token = tokenDoLink((await gerar(c)).link)
    const resposta = await aceitar(token, existente.email, SENHA_DE_TESTE).expect(422)
    expect(resposta.body).toMatchObject({
      codigo: 'REGRA',
      mensagem: 'Este e-mail já está ligado a outro desbravador do clube.',
    })
    expect((await prismaDeTeste().desbravador.findUniqueOrThrow({ where: { id: c.dbv.id } })).usuarioId).toBeNull()
  })

  it('mesmo papel ja ativo no clube: acrescenta as unidades do convite as que ja tinha', async () => {
    const c = await cenario()
    const antiga = await criarUnidade({ clubeId: c.clube.id })
    const existente = await criarUsuario()
    const vinculo = await criarVinculo({
      usuarioId: existente.id,
      clubeId: c.clube.id,
      papel: 'CONSELHEIRO',
      unidadeIds: [antiga.id],
    })
    const token = tokenDoLink((await gerar(c)).link)
    await aceitar(token, existente.email, SENHA_DE_TESTE).expect(200)
    const unidades = await prismaDeTeste().vinculoUnidade.findMany({ where: { vinculoId: vinculo.id } })
    expect(unidades.map((u) => u.unidadeId).sort()).toEqual([antiga.id, c.unidade.id].sort())
    expect(await prismaDeTeste().vinculo.count({ where: { usuarioId: existente.id, clubeId: c.clube.id } })).toBe(1)
  })

  it('unidade desativada entre gerar e aceitar: recusa com mensagem e nada e criado', async () => {
    const c = await cenario()
    const token = tokenDoLink((await gerar(c)).link)
    await prismaDeTeste().unidade.update({ where: { id: c.unidade.id }, data: { ativa: false } })
    const email = emailNovo()
    const resposta = await aceitar(token, email).expect(422)
    expect(resposta.body).toMatchObject({ codigo: 'REGRA' })
    expect(await prismaDeTeste().usuario.count({ where: { email } })).toBe(0)
  })
})

describe('isolamento entre clubes: convite de acesso', () => {
  const doApp = (): INestApplication => app

  async function fichaComUnidade(clube: Clube): Promise<{ dbvId: string; unidadeId: string }> {
    const unidade = await criarUnidade({ clubeId: clube.id })
    const dbv = await criarDbv({ clubeId: clube.id })
    return { dbvId: dbv.id, unidadeId: unidade.id }
  }

  testarIsolamento({
    titulo: 'POST /desbravadores/:id/convite-acesso',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const { dbvId, unidadeId } = await fichaComUnidade(clube)
      return {
        metodo: 'post',
        caminho: `/api/desbravadores/${dbvId}/convite-acesso`,
        corpo: { papel: 'CONSELHEIRO', unidadeIds: [unidadeId] },
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'GET /desbravadores/:id/convite-acesso',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const { dbvId } = await fichaComUnidade(clube)
      return { metodo: 'get', caminho: `/api/desbravadores/${dbvId}/convite-acesso` }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'DELETE /desbravadores/:id/convite-acesso',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const { dbvId } = await fichaComUnidade(clube)
      return { metodo: 'delete', caminho: `/api/desbravadores/${dbvId}/convite-acesso` }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })
})
