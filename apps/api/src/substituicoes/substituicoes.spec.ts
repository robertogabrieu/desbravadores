import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import { DatasElegiveis, Entrada, LinkPublico, SubstituicaoDoAlvo, SubstituicaoGerada } from '@desbravadores/shared'
import request from 'supertest'
import type { z } from 'zod'
import { criarAppDeAuth } from '../../test/app-auth'
import {
  classeOficial,
  configurarClube,
  criarAcesso,
  criarClube,
  criarEvento,
  criarSessao,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  type Acesso,
} from '../../test/fabricas'
import { clienteHttp, criarClasseDoClube } from '../../test/p6'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'
import type { Clube } from '../generated/prisma/client.js'
import { hashDoToken } from '../sessao/tokens'

type Gerada = z.infer<typeof SubstituicaoGerada>

let app: INestApplication
const api = clienteHttp(() => app)
const servidor = (): Server => app.getHttpServer() as Server
const apagar = (url: string, auth: string): request.Test => request(servidor()).delete(url).set('Authorization', auth)
const tokenDoLink = (link: string): string => link.split('/substituto/')[1] ?? ''
const verLink = async (token: string): Promise<z.infer<typeof LinkPublico>> =>
  LinkPublico.parse((await request(servidor()).get(`/api/auth/substituicao/${token}`).expect(200)).body)

/** Sábado 10/10/2026, 10:00 em São Paulo: a reunião de hoje (09:00–12:00) está aberta. */
const DENTRO_DA_REUNIAO = '2026-10-10T13:00:00Z'

interface Cenario {
  clube: Clube
  adm: Acesso
  unidade: { id: string; nome: string }
}

async function cenario(config: { fuso?: string; horaReuniao?: string } = {}): Promise<Cenario> {
  const clube = await criarClube()
  await configurarClube({ clubeId: clube.id, diaReuniao: 6, horaReuniao: config.horaReuniao ?? '09:00', fuso: config.fuso ?? 'America/Sao_Paulo' })
  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
  const unidade = await criarUnidade({ clubeId: clube.id })
  return { clube, adm, unidade }
}

async function gerar(c: Cenario, data = '2026-10-10', alvo = `unidades/${c.unidade.id}`): Promise<Gerada> {
  const resposta = await api.post(`/api/${alvo}/substituicao`, c.adm.autorizacao, { data }).expect(201)
  return SubstituicaoGerada.parse(resposta.body)
}

async function datas(c: Cenario, tipo: 'CHAMADA' | 'CLASSE'): Promise<z.infer<typeof DatasElegiveis>> {
  return DatasElegiveis.parse((await api.get(`/api/substituicoes/datas?tipo=${tipo}`, c.adm.autorizacao).expect(200)).body)
}

beforeAll(async () => {
  app = await criarAppDeAuth()
})

afterEach(() => {
  descongelarRelogio()
})

afterAll(async () => {
  await app.close()
  await desconectarPrismaDeTeste()
})

describe('permissão (critério 1)', () => {
  it('conselheiro recebe 403 ao gerar, ler, cancelar e listar datas', async () => {
    const c = await cenario()
    const conselheiro = await criarAcesso({ clubeId: c.clube.id, papel: 'CONSELHEIRO', unidadeIds: [c.unidade.id] })
    await api.post(`/api/unidades/${c.unidade.id}/substituicao`, conselheiro.autorizacao, { data: '2026-10-10' }).expect(403)
    await api.get(`/api/unidades/${c.unidade.id}/substituicao`, conselheiro.autorizacao).expect(403)
    await apagar(`/api/unidades/${c.unidade.id}/substituicao`, conselheiro.autorizacao).expect(403)
    await api.get('/api/substituicoes/datas?tipo=CHAMADA', conselheiro.autorizacao).expect(403)
  })
})

describe('GET /substituicoes/datas (critério 2)', () => {
  it('de hoje até 28 dias, só dias com reunião; férias tiram; extra entra com o horário dela', async () => {
    congelarRelogio('2026-10-10T11:00:00Z')
    const c = await cenario()
    await criarEvento({ clubeId: c.clube.id, tipo: 'FERIAS', inicio: '2026-10-24' })
    const extra = await criarEvento({ clubeId: c.clube.id, tipo: 'REUNIAO_EXTRA', inicio: '2026-10-14', marcacoes: { temReuniao: true, temClasse: false } })
    await prismaDeTeste().eventoCalendario.update({ where: { id: extra.id }, data: { horario: '19:00' } })
    await criarEvento({ clubeId: c.clube.id, tipo: 'REUNIAO_EXTRA', inicio: '2026-11-14' })

    const lista = await datas(c, 'CHAMADA')
    expect(lista.map((d) => d.data)).toEqual(['2026-10-10', '2026-10-14', '2026-10-17', '2026-10-31', '2026-11-07'])
    expect(lista[0]).toEqual({ data: '2026-10-10', inicioEm: '2026-10-10T12:00:00.000Z', fimEm: '2026-10-10T15:00:00.000Z' })
    expect(lista[1]).toEqual({ data: '2026-10-14', inicioEm: '2026-10-14T22:00:00.000Z', fimEm: '2026-10-15T01:00:00.000Z' })
  })

  it('link de classe: só dias com classe', async () => {
    congelarRelogio('2026-10-10T11:00:00Z')
    const c = await cenario()
    await criarEvento({ clubeId: c.clube.id, tipo: 'EVENTO', inicio: '2026-10-17', marcacoes: { temReuniao: true, temClasse: false } })
    const lista = await datas(c, 'CLASSE')
    expect(lista.map((d) => d.data)).toEqual(['2026-10-10', '2026-10-24', '2026-10-31', '2026-11-07'])
  })

  it('com o fim de hoje já passado, hoje não aparece', async () => {
    congelarRelogio('2026-10-10T15:30:00Z')
    const c = await cenario()
    expect((await datas(c, 'CHAMADA')).map((d) => d.data)[0]).toBe('2026-10-17')
  })

  it('outro fuso, reunião às 22:00: o fim cai no dia seguinte e a data é a do início', async () => {
    congelarRelogio('2026-10-10T11:00:00Z')
    const c = await cenario({ fuso: 'America/Manaus', horaReuniao: '22:00' })
    const [primeira] = await datas(c, 'CHAMADA')
    expect(primeira).toEqual({ data: '2026-10-10', inicioEm: '2026-10-11T02:00:00.000Z', fimEm: '2026-10-11T05:00:00.000Z' })
  })

  it('tipo inválido é 400', async () => {
    const c = await cenario()
    await api.get('/api/substituicoes/datas?tipo=OUTRO', c.adm.autorizacao).expect(400)
  })
})

describe('gerar, ler e cancelar o link', () => {
  it('gera com a janela gravada em UTC, link mostrado uma vez e só o hash no banco', async () => {
    congelarRelogio('2026-10-10T11:00:00Z')
    const c = await cenario()
    const gerada = await gerar(c, '2026-10-17')
    expect(gerada).toMatchObject({
      data: '2026-10-17',
      inicioEm: '2026-10-17T12:00:00.000Z',
      fimEm: '2026-10-17T15:00:00.000Z',
      identificadaEm: null,
      substituto: null,
    })
    expect(gerada.link).toMatch(/\/substituto\/[A-Za-z0-9_-]{43}$/)
    const gravada = await prismaDeTeste().substituicao.findUniqueOrThrow({ where: { id: gerada.id } })
    expect(gravada.tokenHash).toBe(hashDoToken(tokenDoLink(gerada.link)))
    expect(gravada.fimEnvioEm.toISOString()).toBe('2026-10-18T03:00:00.000Z')
    expect(gravada).toMatchObject({ clubeId: c.clube.id, tipo: 'CHAMADA', unidadeId: c.unidade.id, classeId: null, criadoPorId: c.adm.usuario.id })

    const lida = SubstituicaoDoAlvo.parse((await api.get(`/api/unidades/${c.unidade.id}/substituicao`, c.adm.autorizacao).expect(200)).body)
    expect(lida).toEqual({
      id: gerada.id,
      data: '2026-10-17',
      inicioEm: '2026-10-17T12:00:00.000Z',
      fimEm: '2026-10-17T15:00:00.000Z',
      identificadaEm: null,
      substituto: null,
    })
    expect(lida).not.toHaveProperty('link')
  })

  it('dia sem reunião (ou fora dos 28 dias) é recusado', async () => {
    congelarRelogio('2026-10-10T11:00:00Z')
    const c = await cenario()
    await api.post(`/api/unidades/${c.unidade.id}/substituicao`, c.adm.autorizacao, { data: '2026-10-11' }).expect(400)
    await api.post(`/api/unidades/${c.unidade.id}/substituicao`, c.adm.autorizacao, { data: '2026-11-14' }).expect(400)
    expect(await prismaDeTeste().substituicao.count({ where: { clubeId: c.clube.id } })).toBe(0)
  })

  it('sem link aberto, GET devolve nulo', async () => {
    const c = await cenario()
    const resposta = await api.get(`/api/unidades/${c.unidade.id}/substituicao`, c.adm.autorizacao).expect(200)
    expect(resposta.body).toBeNull()
  })

  it('gerar um segundo link (outro dia) cancela o primeiro, que passa a responder CANCELADO (critério 4)', async () => {
    congelarRelogio('2026-10-10T11:00:00Z')
    const c = await cenario()
    const primeiro = await gerar(c, '2026-10-10')
    const segundo = await gerar(c, '2026-10-17')
    expect((await verLink(tokenDoLink(primeiro.link))).estado).toBe('CANCELADO')
    expect((await verLink(tokenDoLink(segundo.link))).estado).toBe('ANTES')
    const anterior = await prismaDeTeste().substituicao.findUniqueOrThrow({ where: { id: primeiro.id } })
    expect(anterior.canceladoEm).not.toBeNull()
  })

  it('dois gerar ao mesmo tempo para o mesmo alvo: um espera o outro e fica um link só sem cancelar', async () => {
    congelarRelogio('2026-10-10T11:00:00Z')
    const c = await cenario()
    let liberar = (): void => undefined
    const segurando = new Promise<void>((resolver) => {
      liberar = resolver
    })
    let avisarTravou = (): void => undefined
    const travou = new Promise<void>((resolver) => {
      avisarTravou = resolver
    })
    // Outra transação segura a linha da unidade: quem gera para ela tem de esperar a vez.
    const outra = prismaDeTeste().$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Unidade" WHERE id = ${c.unidade.id}::uuid FOR UPDATE`
        avisarTravou()
        await segurando
      },
      { timeout: 20_000 },
    )
    await travou
    const terminados: string[] = []
    const pedidos = [gerar(c), gerar(c)].map((pedido) => pedido.then((gerada) => terminados.push(gerada.id)))
    await new Promise((resolver) => setTimeout(resolver, 800))
    expect(terminados).toEqual([])
    liberar()
    await outra
    await Promise.all(pedidos)
    const abertos = await prismaDeTeste().substituicao.count({ where: { unidadeId: c.unidade.id, canceladoEm: null } })
    expect(abertos).toBe(1)
  })

  it('o link de outra unidade não é cancelado', async () => {
    congelarRelogio('2026-10-10T11:00:00Z')
    const c = await cenario()
    const outra = await criarUnidade({ clubeId: c.clube.id })
    const primeiro = await gerar(c, '2026-10-10')
    await gerar(c, '2026-10-10', `unidades/${outra.id}`)
    expect((await verLink(tokenDoLink(primeiro.link))).estado).toBe('ANTES')
  })

  it('DELETE grava canceladoEm e canceladoPorId, nada se apaga, e GET volta a nulo', async () => {
    congelarRelogio('2026-10-10T11:00:00Z')
    const c = await cenario()
    const gerada = await gerar(c, '2026-10-17')
    await apagar(`/api/unidades/${c.unidade.id}/substituicao`, c.adm.autorizacao).expect(204)
    const gravada = await prismaDeTeste().substituicao.findUniqueOrThrow({ where: { id: gerada.id } })
    expect(gravada.canceladoEm).not.toBeNull()
    expect(gravada.canceladoPorId).toBe(c.adm.usuario.id)
    expect((await api.get(`/api/unidades/${c.unidade.id}/substituicao`, c.adm.autorizacao).expect(200)).body).toBeNull()
  })

  it('passado o fim do envio, o link não é mais o aberto', async () => {
    congelarRelogio('2026-10-10T11:00:00Z')
    const c = await cenario()
    await gerar(c, '2026-10-10')
    descongelarRelogio()
    congelarRelogio('2026-10-11T03:00:01Z')
    const autorizacao = `Bearer ${criarSessao({ usuarioId: c.adm.usuario.id, vinculoId: c.adm.vinculo.id })}`
    expect((await api.get(`/api/unidades/${c.unidade.id}/substituicao`, autorizacao).expect(200)).body).toBeNull()
  })

  it('classe do clube e classe oficial ativa servem de alvo', async () => {
    congelarRelogio('2026-10-10T11:00:00Z')
    const c = await cenario()
    const propria = await criarClasseDoClube(c.clube.id)
    const oficial = await classeOficial('Amigo')
    const daPropria = await gerar(c, '2026-10-10', `classes/${propria.id}`)
    await gerar(c, '2026-10-10', `classes/${oficial.id}`)
    const gravada = await prismaDeTeste().substituicao.findUniqueOrThrow({ where: { id: daPropria.id } })
    expect(gravada).toMatchObject({ tipo: 'CLASSE', classeId: propria.id, unidadeId: null })
    const lida = SubstituicaoDoAlvo.parse((await api.get(`/api/classes/${oficial.id}/substituicao`, c.adm.autorizacao).expect(200)).body)
    expect(lida?.data).toBe('2026-10-10')
  })

  it('link de classe só aceita dia com classe', async () => {
    congelarRelogio('2026-10-10T11:00:00Z')
    const c = await cenario()
    await criarEvento({ clubeId: c.clube.id, tipo: 'EVENTO', inicio: '2026-10-17', marcacoes: { temReuniao: true, temClasse: false } })
    const propria = await criarClasseDoClube(c.clube.id)
    await api.post(`/api/classes/${propria.id}/substituicao`, c.adm.autorizacao, { data: '2026-10-17' }).expect(400)
    await api.post(`/api/unidades/${c.unidade.id}/substituicao`, c.adm.autorizacao, { data: '2026-10-17' }).expect(201)
  })
})

describe('alvo fora do clube ou desativado → 404 (critério 6)', () => {
  it('unidade de outro clube, unidade inativa, classe de outro clube e oficial desativada no clube', async () => {
    congelarRelogio('2026-10-10T11:00:00Z')
    const c = await cenario()
    const outroClube = await criarClube()
    const unidadeDeFora = await criarUnidade({ clubeId: outroClube.id })
    const inativa = await criarUnidade({ clubeId: c.clube.id })
    await prismaDeTeste().unidade.update({ where: { id: inativa.id }, data: { ativa: false } })
    const classeDeFora = await criarClasseDoClube(outroClube.id)
    const oficial = await classeOficial('Companheiro')
    await prismaDeTeste().classeClube.update({ where: { clubeId_classeId: { clubeId: c.clube.id, classeId: oficial.id } }, data: { ativa: false } })

    for (const alvo of [`unidades/${unidadeDeFora.id}`, `unidades/${inativa.id}`, `classes/${classeDeFora.id}`, `classes/${oficial.id}`]) {
      await api.post(`/api/${alvo}/substituicao`, c.adm.autorizacao, { data: '2026-10-10' }).expect(404)
      await api.get(`/api/${alvo}/substituicao`, c.adm.autorizacao).expect(404)
      await apagar(`/api/${alvo}/substituicao`, c.adm.autorizacao).expect(404)
    }
    expect(await prismaDeTeste().substituicao.count({ where: { clubeId: c.clube.id } })).toBe(0)
  })
})

describe('depois da identificação (critério 5)', () => {
  it('A4 mostra quem abriu; cancelar faz a próxima leitura e gravação do substituto receber SUBSTITUICAO_ENCERRADA', async () => {
    congelarRelogio(DENTRO_DA_REUNIAO)
    const c = await cenario()
    const gerada = await gerar(c, '2026-10-10')
    const entrada = Entrada.parse(
      (await request(servidor()).post(`/api/auth/substituicao/${tokenDoLink(gerada.link)}/entrar`).send({ nome: '  Maria Souza ' }).expect(200)).body,
    )
    const lida = SubstituicaoDoAlvo.parse((await api.get(`/api/unidades/${c.unidade.id}/substituicao`, c.adm.autorizacao).expect(200)).body)
    expect(lida?.substituto).toEqual({ nome: 'Maria Souza' })
    expect(lida?.identificadaEm).not.toBeNull()

    const credencial = `Bearer ${entrada.credencial}`
    await api.get('/api/_teste/pode-ou-substituto', credencial).expect(200)
    await apagar(`/api/unidades/${c.unidade.id}/substituicao`, c.adm.autorizacao).expect(204)
    const leitura = await api.get('/api/_teste/pode-ou-substituto', credencial).expect(401)
    expect(leitura.body).toMatchObject({ codigo: 'SUBSTITUICAO_ENCERRADA' })
    const gravacao = await api.put('/api/_teste/pode-ou-substituto', credencial).expect(401)
    expect(gravacao.body).toMatchObject({ codigo: 'SUBSTITUICAO_ENCERRADA' })
  })
})
