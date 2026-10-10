import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { hojeNoFuso, PacoteSaida, RankingSaida, type ReuniaoResumo, type AulaResumo, type SituacaoChamada } from '@desbravadores/shared'
import type request from 'supertest'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  anoCorrente,
  chamadasDaReuniao,
  classeOficial,
  credencialDeSubstituicao,
  criarAcesso,
  criarAlbum,
  criarClube,
  criarDbv,
  criarMatricula,
  criarMembro,
  criarRegistroAula,
  criarReuniao,
  criarSubstituicao,
  criarUnidade,
  criarUsuarioDeSubstituicao,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  type Acesso,
} from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'
import type { Clube, Substituicao } from '../generated/prisma/client.js'

const DIA = 86_400_000

function diasAtras(dias: number): string {
  return hojeNoFuso('America/Sao_Paulo', new Date(Date.now() - dias * DIA))
}

/** Outro dia do mesmo mes de `data`, para a listagem mensal ter o que filtrar. */
function outroDiaDoMes(data: string): string {
  return `${data.slice(0, 8)}${data.endsWith('-01') ? '02' : '01'}`
}

let app: INestApplication
const api = clienteHttp(() => app)

beforeAll(async () => {
  app = await criarAppDeTeste()
})

afterAll(async () => {
  await app.close()
  await desconectarPrismaDeTeste()
})

interface CenarioUnidade {
  clube: Clube
  unidade: { id: string }
  outraUnidade: { id: string }
  titular: Acesso
  adm: Acesso
  ana: { id: string }
  bia: { id: string }
  substituicao: Substituicao
  autorizacao: string
}

async function cenarioUnidade(dados: { substitutoId?: string; clube?: Clube } = {}): Promise<CenarioUnidade> {
  const clube = dados.clube ?? (await criarClube())
  const unidade = await criarUnidade({ clubeId: clube.id })
  const outraUnidade = await criarUnidade({ clubeId: clube.id })
  const titular = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
  const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana Souza' })
  const bia = await criarDbv({ clubeId: clube.id, nome: 'Bia Lima' })
  for (const dbv of [ana, bia]) await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-01-01' })
  const substituicao = await criarSubstituicao({
    clubeId: clube.id,
    tipo: 'CHAMADA',
    unidadeId: unidade.id,
    ...(dados.substitutoId ? { substitutoId: dados.substitutoId } : {}),
  })
  return { clube, unidade, outraUnidade, titular, adm, ana, bia, substituicao, autorizacao: credencialDeSubstituicao(substituicao).autorizacao }
}

interface CenarioClasse {
  clube: Clube
  classe: { id: string }
  outraClasse: { id: string }
  titular: Acesso
  ana: { id: string }
  substituicao: Substituicao
  autorizacao: string
}

async function cenarioClasse(dados: { substitutoId?: string; clube?: Clube } = {}): Promise<CenarioClasse> {
  const clube = dados.clube ?? (await criarClube())
  const classe = await classeOficial('Amigo')
  const outraClasse = await classeOficial('Companheiro')
  const titular = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
  const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana Souza' })
  await criarMatricula({ clubeId: clube.id, dbvId: ana.id, classeId: classe.id, anoClube: anoCorrente() })
  const substituicao = await criarSubstituicao({
    clubeId: clube.id,
    tipo: 'CLASSE',
    classeId: classe.id,
    ...(dados.substitutoId ? { substitutoId: dados.substitutoId } : {}),
  })
  return { clube, classe, outraClasse, titular, ana, substituicao, autorizacao: credencialDeSubstituicao(substituicao).autorizacao }
}

function enviarChamada(
  autorizacao: string,
  dados: { unidadeId: string; data?: string; linhas: { dbvId: string; situacao?: SituacaoChamada; versaoVista?: string | null }[]; comCabecalho?: boolean },
): request.Test {
  return api.put(`/api/sync/reunioes/${randomUUID()}`, autorizacao, {
    versaoPayload: 1,
    envioId: randomUUID(),
    unidadeId: dados.unidadeId,
    data: dados.data ?? diasAtras(0),
    feitaNoAparelhoEm: new Date().toISOString(),
    cabecalho: dados.comCabecalho === false ? null : { horario: '09:00', local: null, observacoes: null, versaoVista: null },
    linhas: dados.linhas.map((linha) => ({ situacao: 'PRESENTE', uniforme: false, biblia: false, licao: false, versaoVista: null, ...linha })),
  })
}

function enviarAula(
  autorizacao: string,
  dados: { classeId: string; data?: string; presencas: { dbvId: string; presente?: boolean; versaoVista?: string | null }[] },
): request.Test {
  return api.put(`/api/sync/aulas/${randomUUID()}`, autorizacao, {
    versaoPayload: 1,
    envioId: randomUUID(),
    classeId: dados.classeId,
    data: dados.data ?? diasAtras(0),
    feitaNoAparelhoEm: new Date().toISOString(),
    aulaPlanejadaId: null,
    presencas: dados.presencas.map((presenca) => ({ presente: true, versaoVista: null, ...presenca })),
    requisitosMarcados: [],
    requisitosDesmarcados: [],
  })
}

async function codigo(req: request.Test, status: number): Promise<string> {
  const resposta = await req
  expect(resposta.status).toBe(status)
  return (resposta.body as { codigo: string }).codigo
}

async function reuniaoDoDia(unidadeId: string, data: string) {
  return prismaDeTeste().reuniao.findFirstOrThrow({ where: { unidadeId, data: new Date(`${data}T00:00:00Z`) } })
}

async function registroDoDia(classeId: string, clubeId: string, data: string) {
  return prismaDeTeste().registroAula.findFirstOrThrow({ where: { clubeId, classeId, data: new Date(`${data}T00:00:00Z`) } })
}

describe('recusas com a credencial (critério 17)', () => {
  it('rota fora da tabela responde 401 NAO_AUTENTICADO', async () => {
    const c = await cenarioUnidade()
    expect(await codigo(api.get(`/api/ranking?mes=${diasAtras(0).slice(0, 7)}`, c.autorizacao), 401)).toBe('NAO_AUTENTICADO')
    expect(await codigo(api.get(`/api/unidades/${c.unidade.id}`, c.autorizacao), 401)).toBe('NAO_AUTENTICADO')
  })

  it('GET /reunioes/:id: 200 na unidade e no dia do link; 404 em outra unidade ou outro dia', async () => {
    const c = await cenarioUnidade()
    const hoje = diasAtras(0)
    const doLink = await criarReuniao({ unidadeId: c.unidade.id, data: hoje })
    const deOutroDia = await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(7) })
    const deOutraUnidade = await criarReuniao({ unidadeId: c.outraUnidade.id, data: hoje })
    await api.get(`/api/reunioes/${doLink.id}`, c.autorizacao).expect(200)
    await api.get(`/api/reunioes/${deOutroDia.id}`, c.autorizacao).expect(404)
    await api.get(`/api/reunioes/${deOutraUnidade.id}`, c.autorizacao).expect(404)
  })

  it('PUT /sync/reunioes/:uuid com outra data responde 404 e não grava', async () => {
    const c = await cenarioUnidade()
    await enviarChamada(c.autorizacao, { unidadeId: c.unidade.id, data: diasAtras(7), linhas: [{ dbvId: c.ana.id }] }).expect(404)
    await enviarChamada(c.autorizacao, { unidadeId: c.outraUnidade.id, linhas: [{ dbvId: c.ana.id }] }).expect(404)
    expect(await prismaDeTeste().reuniao.count({ where: { clubeId: c.clube.id } })).toBe(0)
  })

  it('GET /classes/:id/cronograma: 404 em outra classe e com link de unidade; 200 na classe do link', async () => {
    const c = await cenarioClasse()
    await api.get(`/api/classes/${c.classe.id}/cronograma`, c.autorizacao).expect(200)
    await api.get(`/api/classes/${c.outraClasse.id}/cronograma`, c.autorizacao).expect(404)
    const u = await cenarioUnidade({ clube: c.clube })
    await api.get(`/api/classes/${c.classe.id}/cronograma`, u.autorizacao).expect(404)
  })
})

describe('restrição de alvo e dia nas leituras e gravações', () => {
  it('GET /reunioes traz só o dia do link, no mesmo formato; outra unidade 404', async () => {
    const c = await cenarioUnidade()
    const hoje = diasAtras(0)
    const doLink = await criarReuniao({ unidadeId: c.unidade.id, data: hoje })
    await criarReuniao({ unidadeId: c.unidade.id, data: outroDiaDoMes(hoje) })
    const mes = hoje.slice(0, 7)
    const doTitular = corpo<z.infer<typeof ReuniaoResumo>[]>(
      await api.get(`/api/reunioes?unidadeId=${c.unidade.id}&mes=${mes}`, c.titular.autorizacao).expect(200),
    )
    expect(doTitular).toHaveLength(2)
    const doLinkLista = corpo<z.infer<typeof ReuniaoResumo>[]>(
      await api.get(`/api/reunioes?unidadeId=${c.unidade.id}&mes=${mes}`, c.autorizacao).expect(200),
    )
    expect(doLinkLista).toEqual(doTitular.filter((r) => r.id === doLink.id))
    await api.get(`/api/reunioes?unidadeId=${c.outraUnidade.id}&mes=${mes}`, c.autorizacao).expect(404)
  })

  it('link de classe não lê nem grava reunião; link de unidade não lê nem grava aula', async () => {
    const u = await cenarioUnidade()
    const k = await cenarioClasse({ clube: u.clube })
    const hoje = diasAtras(0)
    const reuniao = await criarReuniao({ unidadeId: u.unidade.id, data: hoje })
    const registro = await criarRegistroAula({ clubeId: u.clube.id, classeId: k.classe.id, data: hoje })
    await api.get(`/api/reunioes?unidadeId=${u.unidade.id}&mes=${hoje.slice(0, 7)}`, k.autorizacao).expect(404)
    await api.get(`/api/reunioes/${reuniao.id}`, k.autorizacao).expect(404)
    await enviarChamada(k.autorizacao, { unidadeId: u.unidade.id, linhas: [{ dbvId: u.ana.id }] }).expect(404)
    await api.get(`/api/classes/${k.classe.id}/aulas`, u.autorizacao).expect(404)
    await api.get(`/api/aulas/${registro.id}`, u.autorizacao).expect(404)
    await enviarAula(u.autorizacao, { classeId: k.classe.id, presencas: [{ dbvId: k.ana.id }] }).expect(404)
  })

  it('GET /classes/:id/aulas só o dia do link; GET /aulas/:id 404 fora da classe e do dia', async () => {
    const c = await cenarioClasse()
    const hoje = diasAtras(0)
    const doLink = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: hoje })
    const deOutroDia = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: diasAtras(7) })
    const deOutraClasse = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.outraClasse.id, data: hoje })
    const doTitular = corpo<z.infer<typeof AulaResumo>[]>(await api.get(`/api/classes/${c.classe.id}/aulas`, c.titular.autorizacao).expect(200))
    expect(doTitular.map((a) => a.id).sort()).toEqual([doLink.id, deOutroDia.id].sort())
    const lista = corpo<z.infer<typeof AulaResumo>[]>(await api.get(`/api/classes/${c.classe.id}/aulas`, c.autorizacao).expect(200))
    expect(lista).toEqual(doTitular.filter((a) => a.id === doLink.id))
    await api.get(`/api/classes/${c.outraClasse.id}/aulas`, c.autorizacao).expect(404)
    await api.get(`/api/aulas/${doLink.id}`, c.autorizacao).expect(200)
    await api.get(`/api/aulas/${deOutroDia.id}`, c.autorizacao).expect(404)
    await api.get(`/api/aulas/${deOutraClasse.id}`, c.autorizacao).expect(404)
  })

  it('PUT /sync/aulas/:uuid com outra data ou outra classe responde 404 e não grava', async () => {
    const c = await cenarioClasse()
    await enviarAula(c.autorizacao, { classeId: c.classe.id, data: diasAtras(7), presencas: [{ dbvId: c.ana.id }] }).expect(404)
    await enviarAula(c.autorizacao, { classeId: c.outraClasse.id, presencas: [{ dbvId: c.ana.id }] }).expect(404)
    expect(await prismaDeTeste().registroAula.count({ where: { clubeId: c.clube.id } })).toBe(0)
  })
})

describe('autoria e marca de substituição na chamada', () => {
  it('usuário de substituição (S2): autor dele e substituicaoId marcado', async () => {
    const c = await cenarioUnidade()
    await enviarChamada(c.autorizacao, { unidadeId: c.unidade.id, linhas: [{ dbvId: c.ana.id }] }).expect(200)
    const reuniao = await reuniaoDoDia(c.unidade.id, diasAtras(0))
    expect(reuniao.registradaPorId).toBe(c.substituicao.substitutoId)
    expect(reuniao.substituicaoId).toBe(c.substituicao.id)
    const linhas = await chamadasDaReuniao(reuniao.id)
    expect(linhas.map((l) => l.alteradaPorId)).toEqual([c.substituicao.substitutoId])
  })

  it('membro reconhecido (S3): o autor é o próprio usuário', async () => {
    const clube = await criarClube()
    const membro = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
    const c = await cenarioUnidade({ clube, substitutoId: membro.usuario.id })
    await enviarChamada(c.autorizacao, { unidadeId: c.unidade.id, linhas: [{ dbvId: c.ana.id }] }).expect(200)
    const reuniao = await reuniaoDoDia(c.unidade.id, diasAtras(0))
    expect(reuniao.registradaPorId).toBe(membro.usuario.id)
    expect(reuniao.substituicaoId).toBe(c.substituicao.id)
  })

  it('reenvio sem mudança não marca; mudança marca; envio do titular não apaga (critério 22)', async () => {
    const c = await cenarioUnidade()
    const hoje = diasAtras(0)
    const versao = new Date(Date.now() - 60_000)
    const reuniao = await criarReuniao({
      unidadeId: c.unidade.id,
      data: hoje,
      registradaPorId: c.titular.usuario.id,
      chamada: [{ dbvId: c.ana.id, situacao: 'PRESENTE', versao }],
    })
    const versaoVista = versao.toISOString()
    await enviarChamada(c.autorizacao, { unidadeId: c.unidade.id, comCabecalho: false, linhas: [{ dbvId: c.ana.id, versaoVista }] }).expect(200)
    expect((await reuniaoDoDia(c.unidade.id, hoje)).substituicaoId).toBeNull()

    await enviarChamada(c.autorizacao, {
      unidadeId: c.unidade.id,
      comCabecalho: false,
      linhas: [{ dbvId: c.ana.id, situacao: 'FALTA', versaoVista }],
    }).expect(200)
    expect((await reuniaoDoDia(c.unidade.id, hoje)).substituicaoId).toBe(c.substituicao.id)

    await enviarChamada(c.titular.autorizacao, { unidadeId: c.unidade.id, comCabecalho: false, linhas: [{ dbvId: c.bia.id }] }).expect(200)
    const depois = await reuniaoDoDia(c.unidade.id, hoje)
    expect(depois.id).toBe(reuniao.id)
    expect(depois.substituicaoId).toBe(c.substituicao.id)
  })

  it('pontos da chamada do substituto entram no ranking como os do titular (critério 25)', async () => {
    const c = await cenarioUnidade()
    const outroTitular = await criarAcesso({ clubeId: c.clube.id, papel: 'CONSELHEIRO', unidadeIds: [c.outraUnidade.id] })
    const caio = await criarDbv({ clubeId: c.clube.id, nome: 'Caio Alves' })
    await criarMembro({ dbvId: caio.id, unidadeId: c.outraUnidade.id, inicio: '2026-01-01' })
    await enviarChamada(c.autorizacao, { unidadeId: c.unidade.id, linhas: [{ dbvId: c.ana.id }] }).expect(200)
    await enviarChamada(outroTitular.autorizacao, { unidadeId: c.outraUnidade.id, linhas: [{ dbvId: caio.id }] }).expect(200)
    const ranking = RankingSaida.parse(corpo(await api.get(`/api/ranking?mes=${diasAtras(0).slice(0, 7)}`, c.adm.autorizacao).expect(200)))
    const pontos = (dbvId: string): number | undefined => ranking.itens.find((i) => i.dbvId === dbvId)?.pontos
    expect(pontos(c.ana.id)).toBeGreaterThan(0)
    expect(pontos(c.ana.id)).toBe(pontos(caio.id))
  })
})

describe('autoria e marca de substituição no registro de classe', () => {
  it('usuário de substituição (S2): autor dele, substituicaoId marcado e "(substituto)" no mural', async () => {
    const substituto = await criarUsuarioDeSubstituicao({ nome: 'Carla Dias' })
    const c = await cenarioClasse({ substitutoId: substituto.id })
    await enviarAula(c.autorizacao, { classeId: c.classe.id, presencas: [{ dbvId: c.ana.id }] }).expect(200)
    const registro = await registroDoDia(c.classe.id, c.clube.id, diasAtras(0))
    expect(registro.registradoPorId).toBe(substituto.id)
    expect(registro.substituicaoId).toBe(c.substituicao.id)
    const presencas = await prismaDeTeste().presencaAula.findMany({ where: { registroAulaId: registro.id } })
    expect(presencas.map((p) => p.alteradaPorId)).toEqual([substituto.id])
    const atividade = await prismaDeTeste().atividade.findFirstOrThrow({ where: { clubeId: c.clube.id, tipo: 'AULA_REGISTRADA' } })
    expect(atividade.descricao).toBe('Carla Dias (substituto) registrou a classe de Amigo')
    expect(atividade.autorId).toBe(substituto.id)
  })

  it('membro reconhecido (S3): autor é o próprio usuário, sem "(substituto)"', async () => {
    const clube = await criarClube()
    const membro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    const c = await cenarioClasse({ clube, substitutoId: membro.usuario.id })
    await enviarAula(c.autorizacao, { classeId: c.classe.id, presencas: [{ dbvId: c.ana.id }] }).expect(200)
    const registro = await registroDoDia(c.classe.id, c.clube.id, diasAtras(0))
    expect(registro.registradoPorId).toBe(membro.usuario.id)
    expect(registro.substituicaoId).toBe(c.substituicao.id)
    const atividade = await prismaDeTeste().atividade.findFirstOrThrow({ where: { clubeId: c.clube.id, tipo: 'AULA_REGISTRADA' } })
    expect(atividade.descricao).toBe(`${membro.usuario.nome} registrou a classe de Amigo`)
  })

  it('reenvio sem mudança não marca; mudança marca; envio do titular não apaga', async () => {
    const c = await cenarioClasse()
    const hoje = diasAtras(0)
    const registro = await criarRegistroAula({ clubeId: c.clube.id, classeId: c.classe.id, data: hoje, presencas: [{ dbvId: c.ana.id }] })
    const [presenca] = await prismaDeTeste().presencaAula.findMany({ where: { registroAulaId: registro.id } })
    const versaoVista = presenca?.versao.toISOString() ?? null
    await enviarAula(c.autorizacao, { classeId: c.classe.id, presencas: [{ dbvId: c.ana.id, versaoVista }] }).expect(200)
    expect((await registroDoDia(c.classe.id, c.clube.id, hoje)).substituicaoId).toBeNull()

    await enviarAula(c.autorizacao, { classeId: c.classe.id, presencas: [{ dbvId: c.ana.id, presente: false, versaoVista }] }).expect(200)
    expect((await registroDoDia(c.classe.id, c.clube.id, hoje)).substituicaoId).toBe(c.substituicao.id)

    await enviarAula(c.titular.autorizacao, { classeId: c.classe.id, presencas: [{ dbvId: c.ana.id, presente: true }] }).expect(200)
    expect((await registroDoDia(c.classe.id, c.clube.id, hoje)).substituicaoId).toBe(c.substituicao.id)
  })
})

describe('GET /sync/pacote com a credencial', () => {
  it('link de unidade: só o alvo, reuniões só do dia, sem álbuns, identidade = id da substituição', async () => {
    const clube = await criarClube()
    const membro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    const c = await cenarioUnidade({ clube, substitutoId: membro.usuario.id })
    const hoje = diasAtras(0)
    const doDia = await criarReuniao({ unidadeId: c.unidade.id, data: hoje })
    await criarReuniao({ unidadeId: c.unidade.id, data: diasAtras(7) })
    await criarReuniao({ unidadeId: c.outraUnidade.id, data: hoje })
    await criarAlbum({ unidadeId: c.unidade.id, data: hoje })
    const pacote = PacoteSaida.parse(corpo(await api.get('/api/sync/pacote', c.autorizacao).expect(200)))
    expect(pacote.usuarioId).toBe(c.substituicao.id)
    expect(pacote.vinculoId).toBe(c.substituicao.id)
    expect(pacote.unidades.map((u) => u.id)).toEqual([c.unidade.id])
    expect(pacote.reunioesRecentes.map((r) => r.id)).toEqual([doDia.id])
    expect(pacote.albunsRecentes).toEqual([])
    expect(pacote.instrutor).toBeNull()
  })

  it('link de classe: só a classe do link e membros[].voce sempre falso', async () => {
    const clube = await criarClube()
    const membro = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
    const c = await cenarioClasse({ clube, substitutoId: membro.usuario.id })
    const fichaDoMembro = await criarDbv({ clubeId: clube.id, nome: 'Membro Dono', tipo: 'DIRETORIA', usuarioId: membro.usuario.id })
    await criarMatricula({ clubeId: clube.id, dbvId: fichaDoMembro.id, classeId: c.classe.id, anoClube: anoCorrente() })
    const pacote = PacoteSaida.parse(corpo(await api.get('/api/sync/pacote', c.autorizacao).expect(200)))
    expect(pacote.usuarioId).toBe(c.substituicao.id)
    expect(pacote.vinculoId).toBe(c.substituicao.id)
    expect(pacote.unidades).toEqual([])
    expect(pacote.instrutor?.classes.map((k) => k.classe.id)).toEqual([c.classe.id])
    const membros = pacote.instrutor?.classes[0]?.membros ?? []
    expect(membros.map((m) => m.dbvId).sort()).toEqual([c.ana.id, fichaDoMembro.id].sort())
    expect(membros.every((m) => !m.voce)).toBe(true)
  })
})
