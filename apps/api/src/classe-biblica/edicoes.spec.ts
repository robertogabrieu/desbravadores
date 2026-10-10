import type { INestApplication } from '@nestjs/common'
import { hojeNoFuso, type DatasSaida, type EdicaoSaida, type EdicoesSaida, type ErroApi, type GruposSaida, type PainelSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarChamadaCB,
  criarClube,
  criarDbv,
  criarEdicaoCB,
  criarEncontroCB,
  criarEvento,
  criarGrupoCB,
  criarMembro,
  criarUnidade,
  configurarClube,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'
import { garantirCriterios } from './criterios'

type Edicao = z.infer<typeof EdicaoSaida>
type Lista = z.infer<typeof EdicoesSaida>
type Grupos = z.infer<typeof GruposSaida>
type Datas = z.infer<typeof DatasSaida>
type Painel = z.infer<typeof PainelSaida>
type Erro = z.infer<typeof ErroApi>

const BASE = '/api/classe-biblica'

describe('classe bíblica: edição', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  async function cenario() {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const aguias = await criarUnidade({ clubeId: clube.id, nome: 'Águias' })
    const leoes = await criarUnidade({ clubeId: clube.id, nome: 'Leões' })
    return { clube, adm, aguias, leoes }
  }

  /** Rascunho completo (etapa 1) de 07/03/2027 a 27/06/2027, aos domingos. */
  async function rascunho(auth: string, dados: Record<string, unknown> = {}): Promise<Edicao> {
    const resposta = await api
      .post(`${BASE}/edicoes`, auth, {
        nome: 'Classe Bíblica 2027',
        inicio: '2027-03-07',
        fim: '2027-06-27',
        diaSemana: 0,
        horario: '14:00',
        local: 'Sala 3',
        ...dados,
      })
      .expect(201)
    return corpo<Edicao>(resposta)
  }

  async function nomearEvento(eventoId: string, nome: string): Promise<void> {
    await prismaDeTeste().eventoCalendario.update({ where: { id: eventoId }, data: { nome } })
  }

  describe('rascunho', () => {
    it('nasce só com o nome, com dia e local da configuração e horário vazio, e é retomado', async () => {
      const { clube, adm } = await cenario()
      await configurarClube({ clubeId: clube.id, diaReuniao: 6, localReuniaoPadrao: 'Salão da igreja' })

      const criada = corpo<Edicao>(await api.post(`${BASE}/edicoes`, adm.autorizacao, { nome: 'CB 2027' }).expect(201))
      expect(criada).toMatchObject({
        nome: 'CB 2027', diaSemana: 6, local: 'Salão da igreja', horario: null, etapa: 1, situacao: 'NAO_TERMINADA', terminadaEm: null,
      })
      expect(typeof criada.atualizadaEm).toBe('string')

      const editada = corpo<Edicao>(
        await api.patch(`${BASE}/edicoes/${criada.id}`, adm.autorizacao, { horario: '14:00', etapa: 2 }).expect(200),
      )
      expect(editada).toMatchObject({ nome: 'CB 2027', horario: '14:00', etapa: 2 })

      const painel = corpo<Painel>(await api.get(`${BASE}/edicoes/${criada.id}`, adm.autorizacao).expect(200))
      expect(painel.edicao).toMatchObject({ id: criada.id, nome: 'CB 2027', etapa: 2, horario: '14:00' })

      const lista = corpo<Lista>(await api.get(`${BASE}/edicoes`, adm.autorizacao).expect(200))
      expect(lista.padroes).toEqual({ diaSemana: 6, local: 'Salão da igreja' })
      expect(lista.edicoes.find((e) => e.id === criada.id)).toMatchObject({ situacao: 'NAO_TERMINADA', etapa: 2 })
    })

    it('fim antes do início é recusado no campo fim, sem mudar o resto', async () => {
      const { adm } = await cenario()
      const criada = await rascunho(adm.autorizacao)
      const resposta = await api.patch(`${BASE}/edicoes/${criada.id}`, adm.autorizacao, { fim: '2027-03-01' }).expect(400)
      expect(corpo<Erro>(resposta).campos).toEqual({ fim: 'O fim precisa ser depois do início (07/03/2027)' })
      const painel = corpo<Painel>(await api.get(`${BASE}/edicoes/${criada.id}`, adm.autorizacao).expect(200))
      expect(painel.edicao.fim).toBe('2027-06-27')
    })
  })

  describe('lista', () => {
    it('mostra as três situações; material faltando não muda a situação', async () => {
      const { clube, adm, aguias } = await cenario()
      const naoTerminada = await rascunho(adm.autorizacao, { etapa: 2 })
      const emAndamento = await criarEdicaoCB({ clubeId: clube.id, terminada: true, inicio: '2026-08-16', fim: '2027-12-12' })
      await criarGrupoCB({ clubeId: clube.id, edicaoId: emAndamento.id, unidadeIds: [aguias.id] })
      const encerrada = await criarEdicaoCB({ clubeId: clube.id, terminada: true, inicio: '2025-08-17', fim: '2025-12-14' })
      const feito = await criarEncontroCB({ clubeId: clube.id, edicaoId: emAndamento.id, data: '2026-08-16' })
      await criarEncontroCB({ clubeId: clube.id, edicaoId: emAndamento.id, data: '2027-01-10' })
      await criarEncontroCB({ clubeId: clube.id, edicaoId: emAndamento.id, data: '2027-01-17', cancelado: true })
      const grupo = await prismaDeTeste().grupoClasseBiblica.findFirstOrThrow({ where: { edicaoId: emAndamento.id } })
      const dbv = await criarDbv({ clubeId: clube.id })
      const outro = await criarDbv({ clubeId: clube.id })
      await criarChamadaCB({
        clubeId: clube.id, encontroId: feito.id, grupoId: grupo.id,
        linhas: [{ dbvId: dbv.id, unidadeId: aguias.id }, { dbvId: outro.id, unidadeId: aguias.id, presente: false }],
      })

      const lista = corpo<Lista>(await api.get(`${BASE}/edicoes`, adm.autorizacao).expect(200))
      expect(lista.unidades).toBe(2)
      expect(lista.edicoes.map((e) => e.id)).toEqual([naoTerminada.id, emAndamento.id, encerrada.id])
      expect(lista.edicoes.map((e) => e.situacao)).toEqual(['NAO_TERMINADA', 'EM_ANDAMENTO', 'ENCERRADA'])
      expect(lista.edicoes[0]?.etapa).toBe(2)
      expect(lista.edicoes[1]).toMatchObject({
        encontros: 2, encontrosFeitos: 1, presencaMedia: 50, proximoEncontro: { data: '2027-01-10', horario: '14:00' },
      })
    })
  })

  describe('grupos', () => {
    it('unidade repetida na mesma edição é recusada como validação', async () => {
      const { adm, aguias } = await cenario()
      const criada = await rascunho(adm.autorizacao)
      const resposta = await api
        .put(`${BASE}/edicoes/${criada.id}/grupos`, adm.autorizacao, {
          grupos: [{ nome: 'Daniel', unidadeIds: [aguias.id] }, { nome: 'Ester', unidadeIds: [aguias.id] }],
        })
        .expect(400)
      expect(corpo<Erro>(resposta)).toMatchObject({ codigo: 'VALIDACAO', mensagem: 'A unidade Águias está em dois grupos.' })
    })

    it('grava, reabre e mostra quem ocupa cada unidade', async () => {
      const { clube, adm, aguias, leoes } = await cenario()
      const outra = await criarEdicaoCB({ clubeId: clube.id, terminada: true, nome: 'CB 1º semestre', inicio: '2027-01-03', fim: '2027-03-14' })
      await criarGrupoCB({ clubeId: clube.id, edicaoId: outra.id, unidadeIds: [leoes.id] })
      const criada = await rascunho(adm.autorizacao)

      const salvo = corpo<Grupos>(
        await api.put(`${BASE}/edicoes/${criada.id}/grupos`, adm.autorizacao, { grupos: [{ nome: 'Daniel', unidadeIds: [aguias.id] }] }).expect(200),
      )
      expect(salvo.grupos).toEqual([
        expect.objectContaining({ nome: 'Daniel', ordem: 0, unidadeIds: [aguias.id], material: null, temChamada: false }),
      ])
      const reaberto = corpo<Grupos>(await api.get(`${BASE}/edicoes/${criada.id}/grupos`, adm.autorizacao).expect(200))
      expect(reaberto.grupos.map((g) => g.nome)).toEqual(['Daniel'])
      expect(reaberto.unidades.find((u) => u.id === aguias.id)?.ocupadaPor).toEqual({ tipo: 'GRUPO', nome: 'Daniel' })
      expect(reaberto.unidades.find((u) => u.id === leoes.id)?.ocupadaPor).toEqual({
        tipo: 'EDICAO', nome: 'CB 1º semestre', inicio: '2027-01-03', fim: '2027-03-14',
      })
    })

    it('dois rascunhos convivem com a mesma unidade', async () => {
      const { adm, aguias } = await cenario()
      const um = await rascunho(adm.autorizacao)
      const dois = await rascunho(adm.autorizacao)
      await api.put(`${BASE}/edicoes/${um.id}/grupos`, adm.autorizacao, { grupos: [{ nome: 'A', unidadeIds: [aguias.id] }] }).expect(200)
      await api.put(`${BASE}/edicoes/${dois.id}/grupos`, adm.autorizacao, { grupos: [{ nome: 'B', unidadeIds: [aguias.id] }] }).expect(200)
    })

    it('unidade de edição terminada com período cruzado é recusada com o texto da regra', async () => {
      const { clube, adm, aguias } = await cenario()
      const outra = await criarEdicaoCB({ clubeId: clube.id, terminada: true, nome: 'CB 1º semestre', inicio: '2027-03-07', fim: '2027-06-27' })
      await criarGrupoCB({ clubeId: clube.id, edicaoId: outra.id, unidadeIds: [aguias.id] })
      const criada = await rascunho(adm.autorizacao, { inicio: '2027-06-06', fim: '2027-12-19' })
      const resposta = await api
        .put(`${BASE}/edicoes/${criada.id}/grupos`, adm.autorizacao, { grupos: [{ nome: 'Daniel', unidadeIds: [aguias.id] }] })
        .expect(422)
      expect(corpo<Erro>(resposta).mensagem).toBe(
        'A unidade Águias já está na edição CB 1º semestre, de 07/03 a 27/06. Tire-a deste grupo para continuar.',
      )
    })
  })

  describe('datas', () => {
    it('17 domingos, dois desmarcados por "Sem reunião: Páscoa"', async () => {
      const { clube, adm } = await cenario()
      const pascoa = await criarEvento({ clubeId: clube.id, tipo: 'SEM_REUNIAO', inicio: '2027-03-28', fim: '2027-04-04' })
      await nomearEvento(pascoa.id, 'Páscoa')
      const removido = await criarEvento({ clubeId: clube.id, tipo: 'FERIADO', inicio: '2027-05-02' })
      await prismaDeTeste().eventoCalendario.update({ where: { id: removido.id }, data: { removidoEm: new Date() } })
      await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: '2027-05-09' })
      const criada = await rascunho(adm.autorizacao)

      const { datas } = corpo<Datas>(await api.get(`${BASE}/edicoes/${criada.id}/datas`, adm.autorizacao).expect(200))
      expect(datas).toHaveLength(17)
      expect(datas[0]?.data).toBe('2027-03-07')
      expect(datas[16]?.data).toBe('2027-06-27')
      expect(datas.filter((d) => !d.marcada)).toEqual([
        { data: '2027-03-28', marcada: false, motivo: 'Sem reunião: Páscoa' },
        { data: '2027-04-04', marcada: false, motivo: 'Sem reunião: Páscoa' },
      ])
    })
  })

  describe('terminar', () => {
    async function prontaParaTerminar() {
      const base = await cenario()
      const criada = await rascunho(base.adm.autorizacao)
      await api
        .put(`${BASE}/edicoes/${criada.id}/grupos`, base.adm.autorizacao, { grupos: [{ nome: 'Daniel', unidadeIds: [base.aguias.id] }] })
        .expect(200)
      return { ...base, criada }
    }
    const DATAS = ['2027-03-07', '2027-03-14', '2027-03-21']

    it('cria um encontro e um evento neutro por data marcada e os critérios', async () => {
      const { clube, adm, criada } = await prontaParaTerminar()
      const painel = corpo<Painel>(await api.post(`${BASE}/edicoes/${criada.id}/terminar`, adm.autorizacao, { datas: DATAS }).expect(201))
      expect(painel.edicao).toMatchObject({ situacao: 'EM_ANDAMENTO', etapa: 3 })
      expect(painel.edicao.terminadaEm).not.toBeNull()

      const encontros = await prismaDeTeste().encontroClasseBiblica.findMany({
        where: { edicaoId: criada.id }, include: { evento: true }, orderBy: { data: 'asc' },
      })
      expect(encontros.map((e) => e.data.toISOString().slice(0, 10))).toEqual(DATAS)
      for (const encontro of encontros) {
        expect(encontro).toMatchObject({ clubeId: clube.id, horario: '14:00', local: 'Sala 3' })
        expect(encontro.evento).toMatchObject({
          tipo: 'CLASSE_BIBLICA', nome: 'Classe Bíblica 2027', horario: '14:00', local: 'Sala 3',
          temReuniao: true, temClasse: true, bomParaCampo: false, removidoEm: null,
        })
        expect(encontro.evento.inicio).toEqual(encontro.data)
      }
      const criterios = await prismaDeTeste().criterioRanking.findMany({
        where: { clubeId: clube.id, gatilho: { in: ['CLASSE_BIBLICA_PRESENCA', 'CLASSE_BIBLICA_PARTICIPACAO'] } },
      })
      expect(criterios).toHaveLength(2)
    })

    it('duas chamadas seguidas e duas concorrentes não duplicam', async () => {
      const { clube, adm, criada } = await prontaParaTerminar()
      const url = `${BASE}/edicoes/${criada.id}/terminar`
      await Promise.all([api.post(url, adm.autorizacao, { datas: DATAS }).expect(201), api.post(url, adm.autorizacao, { datas: DATAS }).expect(201)])
      await api.post(url, adm.autorizacao, { datas: ['2027-03-28'] }).expect(201)
      expect(await prismaDeTeste().encontroClasseBiblica.count({ where: { edicaoId: criada.id } })).toBe(3)
      expect(await prismaDeTeste().eventoCalendario.count({ where: { clubeId: clube.id, tipo: 'CLASSE_BIBLICA' } })).toBe(3)
    })

    it('exige os dados da etapa 1, grupo com unidade e datas do período', async () => {
      const { adm, aguias } = await cenario()
      const semHorario = await rascunho(adm.autorizacao, { horario: null })
      await api.put(`${BASE}/edicoes/${semHorario.id}/grupos`, adm.autorizacao, { grupos: [{ nome: 'D', unidadeIds: [aguias.id] }] }).expect(200)
      const r1 = await api.post(`${BASE}/edicoes/${semHorario.id}/terminar`, adm.autorizacao, { datas: DATAS }).expect(400)
      expect(corpo<Erro>(r1).campos).toHaveProperty('horario')

      const semGrupo = await rascunho(adm.autorizacao)
      await api.post(`${BASE}/edicoes/${semGrupo.id}/terminar`, adm.autorizacao, { datas: DATAS }).expect(422)

      const foraDoPeriodo = await rascunho(adm.autorizacao)
      await api.put(`${BASE}/edicoes/${foraDoPeriodo.id}/grupos`, adm.autorizacao, { grupos: [{ nome: 'D', unidadeIds: [aguias.id] }] }).expect(200)
      await api.post(`${BASE}/edicoes/${foraDoPeriodo.id}/terminar`, adm.autorizacao, { datas: ['2027-03-08'] }).expect(400)
      await api.post(`${BASE}/edicoes/${foraDoPeriodo.id}/terminar`, adm.autorizacao, { datas: [] }).expect(400)
      expect(await prismaDeTeste().encontroClasseBiblica.count({ where: { edicaoId: { in: [semHorario.id, semGrupo.id, foraDoPeriodo.id] } } })).toBe(0)
    })

    it('reconfere a unidade contra edição que terminou depois do rascunho marcá-la', async () => {
      const { clube, adm, aguias, criada } = await prontaParaTerminar()
      const outra = await criarEdicaoCB({ clubeId: clube.id, terminada: true, nome: 'CB 1º semestre', inicio: '2027-01-03', fim: '2027-03-14' })
      await criarGrupoCB({ clubeId: clube.id, edicaoId: outra.id, unidadeIds: [aguias.id] })
      const resposta = await api.post(`${BASE}/edicoes/${criada.id}/terminar`, adm.autorizacao, { datas: DATAS }).expect(422)
      expect(corpo<Erro>(resposta).mensagem).toBe(
        'A unidade Águias já está na edição CB 1º semestre, de 03/01 a 14/03. Tire-a deste grupo para continuar.',
      )
      expect(await prismaDeTeste().encontroClasseBiblica.count({ where: { edicaoId: criada.id } })).toBe(0)
      const edicao = await prismaDeTeste().edicaoClasseBiblica.findUniqueOrThrow({ where: { id: criada.id } })
      expect(edicao.terminadaEm).toBeNull()
    })
  })

  describe('garantirCriterios', () => {
    const NOMES = ['Presença na Classe Bíblica', 'Participou ativamente da Classe Bíblica']

    it('é idempotente, cria 10 e 5 depois da maior ordem', async () => {
      const clube = await criarClube()
      const prisma = prismaDeTeste()
      await prisma.$transaction((tx) => garantirCriterios(tx, clube.id))
      await prisma.$transaction((tx) => garantirCriterios(tx, clube.id))
      const todos = await prisma.criterioRanking.findMany({ where: { clubeId: clube.id }, orderBy: { ordem: 'asc' } })
      expect(todos).toHaveLength(10)
      expect(todos.slice(8).map((c) => [c.nome, c.pontos, c.ordem, c.gatilho, c.padrao, c.ativo, c.lancadoPor])).toEqual([
        [NOMES[0], 10, 9, 'CLASSE_BIBLICA_PRESENCA', true, true, 'ADM'],
        [NOMES[1], 5, 10, 'CLASSE_BIBLICA_PARTICIPACAO', true, true, 'ADM'],
      ])
    })

    it('reaproveita o padrão que já existe e desvia do nome de critério não padrão', async () => {
      const clube = await criarClube()
      const prisma = prismaDeTeste()
      await prisma.criterioRanking.create({
        data: { clubeId: clube.id, nome: NOMES[0] ?? '', pontos: 1, ordem: 20, gatilho: 'MANUAL', lancadoPor: 'ADM', padrao: false },
      })
      const existente = await prisma.criterioRanking.create({
        data: { clubeId: clube.id, nome: 'Participação CB', pontos: 7, ordem: 3, gatilho: 'CLASSE_BIBLICA_PARTICIPACAO', lancadoPor: 'ADM', padrao: true },
      })
      await prisma.$transaction((tx) => garantirCriterios(tx, clube.id))
      const novos = await prisma.criterioRanking.findMany({
        where: { clubeId: clube.id, gatilho: { in: ['CLASSE_BIBLICA_PRESENCA', 'CLASSE_BIBLICA_PARTICIPACAO'] } },
        orderBy: { ordem: 'asc' },
      })
      expect(novos.map((c) => [c.id === existente.id ? 'existente' : c.nome, c.ordem])).toEqual([
        ['existente', 3],
        ['Presença na Classe Bíblica (Classe Bíblica)', 21],
      ])
    })

    it('nome alternativo também tomado ganha sufixo numérico até achar um livre', async () => {
      const clube = await criarClube()
      const prisma = prismaDeTeste()
      const tomados = [NOMES[0] ?? '', `${NOMES[0] ?? ''} (Classe Bíblica)`, `${NOMES[0] ?? ''} (Classe Bíblica) 2`]
      for (const [ordem, nome] of tomados.entries()) {
        await prisma.criterioRanking.create({ data: { clubeId: clube.id, nome, pontos: 1, ordem: 20 + ordem, gatilho: 'MANUAL', lancadoPor: 'ADM', padrao: false } })
      }
      await prisma.$transaction((tx) => garantirCriterios(tx, clube.id))
      const criado = await prisma.criterioRanking.findFirstOrThrow({ where: { clubeId: clube.id, gatilho: 'CLASSE_BIBLICA_PRESENCA', padrao: true } })
      expect(criado.nome).toBe(`${NOMES[0] ?? ''} (Classe Bíblica) 3`)
    })
  })

  describe('edição terminada', () => {
    async function terminada() {
      const base = await cenario()
      const edicao = await criarEdicaoCB({ clubeId: base.clube.id, terminada: true, inicio: '2026-08-16', fim: '2027-12-12' })
      const comChamada = await criarGrupoCB({ clubeId: base.clube.id, edicaoId: edicao.id, nome: 'Daniel', unidadeIds: [base.aguias.id] })
      const semChamada = await criarGrupoCB({ clubeId: base.clube.id, edicaoId: edicao.id, nome: 'Ester', unidadeIds: [base.leoes.id] })
      const passado = await criarEncontroCB({ clubeId: base.clube.id, edicaoId: edicao.id, data: '2026-08-16' })
      const futuroFeito = await criarEncontroCB({ clubeId: base.clube.id, edicaoId: edicao.id, data: '2027-01-10' })
      const futuro = await criarEncontroCB({ clubeId: base.clube.id, edicaoId: edicao.id, data: '2027-01-17' })
      const dbv = await criarDbv({ clubeId: base.clube.id })
      await criarMembro({ dbvId: dbv.id, unidadeId: base.aguias.id, inicio: '2026-02-01' })
      await criarChamadaCB({ clubeId: base.clube.id, encontroId: futuroFeito.id, grupoId: comChamada.id, linhas: [{ dbvId: dbv.id, unidadeId: base.aguias.id }] })
      return { ...base, edicao, comChamada, semChamada, passado, futuroFeito, futuro }
    }

    it('início, fim e dia são recusados; nome, horário e local mudam', async () => {
      const { adm, edicao } = await terminada()
      for (const mudanca of [{ inicio: '2026-08-23' }, { fim: '2027-12-19' }, { diaSemana: 6 }]) {
        await api.patch(`${BASE}/edicoes/${edicao.id}`, adm.autorizacao, mudanca).expect(422)
      }
      const editada = corpo<Edicao>(await api.patch(`${BASE}/edicoes/${edicao.id}`, adm.autorizacao, { nome: 'CB nova', local: 'Templo' }).expect(200))
      expect(editada).toMatchObject({ nome: 'CB nova', local: 'Templo', inicio: '2026-08-16' })
    })

    it('horário propaga só aos encontros futuros sem chamada e aos eventos deles', async () => {
      const { adm, edicao, passado, futuroFeito, futuro } = await terminada()
      await api.patch(`${BASE}/edicoes/${edicao.id}`, adm.autorizacao, { horario: '15:00' }).expect(200)
      const prisma = prismaDeTeste()
      const ler = (id: string) => prisma.encontroClasseBiblica.findUniqueOrThrow({ where: { id }, include: { evento: true } })
      const [p, f, u] = await Promise.all([ler(passado.id), ler(futuroFeito.id), ler(futuro.id)])
      expect([p.horario, p.evento.horario]).toEqual(['14:00', '14:00'])
      expect([f.horario, f.evento.horario]).toEqual(['14:00', '14:00'])
      expect([u.horario, u.evento.horario]).toEqual(['15:00', '15:00'])
    })

    it('grupo com chamada não sai; grupo sem chamada sai com as unidades', async () => {
      const { adm, edicao, comChamada, semChamada, aguias, leoes } = await terminada()
      const recusa = await api.put(`${BASE}/edicoes/${edicao.id}/grupos`, adm.autorizacao, {
        grupos: [{ id: semChamada.id, nome: 'Ester', unidadeIds: [leoes.id] }],
      }).expect(422)
      expect(corpo<Erro>(recusa).mensagem).toBe('O grupo Daniel já tem chamada feita e não pode sair da edição.')

      const salvo = corpo<Grupos>(await api.put(`${BASE}/edicoes/${edicao.id}/grupos`, adm.autorizacao, {
        grupos: [{ id: comChamada.id, nome: 'Daniel', unidadeIds: [aguias.id] }],
      }).expect(200))
      expect(salvo.grupos.map((g) => [g.nome, g.temChamada])).toEqual([['Daniel', true]])
      const removido = await prismaDeTeste().grupoClasseBiblica.findUniqueOrThrow({ where: { id: semChamada.id } })
      expect(removido.removidoEm).not.toBeNull()
      expect(await prismaDeTeste().grupoUnidadeClasseBiblica.count({ where: { grupoId: semChamada.id } })).toBe(0)
    })

    it('grupo sem unidade é recusado, como no terminar', async () => {
      const { adm, edicao, comChamada, semChamada, aguias } = await terminada()
      const recusa = await api.put(`${BASE}/edicoes/${edicao.id}/grupos`, adm.autorizacao, {
        grupos: [{ id: comChamada.id, nome: 'Daniel', unidadeIds: [aguias.id] }, { id: semChamada.id, nome: 'Ester', unidadeIds: [] }],
      }).expect(400)
      expect(corpo<Erro>(recusa)).toMatchObject({ codigo: 'VALIDACAO', campos: { grupos: 'Cada grupo precisa de ao menos uma unidade.' } })
      expect(await prismaDeTeste().grupoUnidadeClasseBiblica.count({ where: { grupoId: semChamada.id } })).toBe(1)
    })
  })

  describe('período das unidades nos grupos (D32)', () => {
    async function hojeDo(clubeId: string): Promise<string> {
      const { fuso } = await prismaDeTeste().configuracaoClube.findUniqueOrThrow({ where: { clubeId } })
      return hojeNoFuso(fuso, new Date())
    }
    /** Períodos da edição como [grupo, unidade, início, fim], em ordem estável. */
    async function periodos(edicaoId: string, nomes: Record<string, string>): Promise<[string, string, string, string | null][]> {
      const linhas = await prismaDeTeste().grupoUnidadeClasseBiblica.findMany({
        where: { edicaoId },
        include: { grupo: { select: { nome: true } } },
        orderBy: [{ inicio: 'asc' }, { unidadeId: 'asc' }],
      })
      return linhas
        .map((l): [string, string, string, string | null] => [l.grupo.nome, nomes[l.unidadeId] ?? l.unidadeId, l.inicio.toISOString().slice(0, 10), l.fim ? l.fim.toISOString().slice(0, 10) : null])
        .sort((a, b) => a.join().localeCompare(b.join()))
    }

    it('em edição terminada: mover fecha em hoje e abre no outro grupo no mesmo dia; voltar no mesmo dia apaga o período de hoje e reabre o antigo', async () => {
      const { clube, adm, aguias, leoes } = await cenario()
      const gavioes = await criarUnidade({ clubeId: clube.id, nome: 'Gaviões' })
      const edicao = await criarEdicaoCB({ clubeId: clube.id, terminada: true, inicio: '2026-08-16', fim: '2027-12-12' })
      const daniel = await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, nome: 'Daniel', unidadeIds: [aguias.id] })
      const ester = await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, nome: 'Ester', unidadeIds: [leoes.id] })
      const hoje = await hojeDo(clube.id)
      const nomes = { [aguias.id]: 'Águias', [leoes.id]: 'Leões', [gavioes.id]: 'Gaviões' }
      const salvar = (dGrupos: string[], eGrupos: string[]) =>
        api.put(`${BASE}/edicoes/${edicao.id}/grupos`, adm.autorizacao, {
          grupos: [{ id: daniel.id, nome: 'Daniel', unidadeIds: dGrupos }, { id: ester.id, nome: 'Ester', unidadeIds: eGrupos }],
        }).expect(200)

      await salvar([gavioes.id], [leoes.id, aguias.id])
      expect(await periodos(edicao.id, nomes)).toEqual([
        ['Daniel', 'Gaviões', hoje, null],
        ['Daniel', 'Águias', '2026-08-16', hoje],
        ['Ester', 'Leões', '2026-08-16', null],
        ['Ester', 'Águias', hoje, null],
      ].sort((a, b) => a.join().localeCompare(b.join())))
      const reaberto = corpo<Grupos>(await api.get(`${BASE}/edicoes/${edicao.id}/grupos`, adm.autorizacao).expect(200))
      expect(reaberto.grupos.map((g) => [g.nome, g.unidadeIds])).toEqual([['Daniel', [gavioes.id]], ['Ester', [aguias.id, leoes.id]]])
      expect(reaberto.unidades.find((u) => u.id === aguias.id)?.ocupadaPor).toEqual({ tipo: 'GRUPO', nome: 'Ester' })

      await salvar([aguias.id], [leoes.id])
      expect(await periodos(edicao.id, nomes)).toEqual([
        ['Daniel', 'Águias', '2026-08-16', null],
        ['Ester', 'Leões', '2026-08-16', null],
      ])
    })

    it('em edição terminada que ainda não começou: o período que entra abre no início da edição e o que sai é apagado', async () => {
      const { clube, adm, aguias, leoes } = await cenario()
      const edicao = await criarEdicaoCB({ clubeId: clube.id, terminada: true, inicio: '2027-03-07', fim: '2027-06-27' })
      const daniel = await criarGrupoCB({ clubeId: clube.id, edicaoId: edicao.id, nome: 'Daniel', unidadeIds: [aguias.id] })
      await api.put(`${BASE}/edicoes/${edicao.id}/grupos`, adm.autorizacao, { grupos: [{ id: daniel.id, nome: 'Daniel', unidadeIds: [leoes.id] }] }).expect(200)
      expect(await periodos(edicao.id, { [aguias.id]: 'Águias', [leoes.id]: 'Leões' })).toEqual([['Daniel', 'Leões', '2027-03-07', null]])
    })

    it('em rascunho, salvar substitui os períodos (sem início, começam hoje) e terminar os põe no início da edição', async () => {
      const { clube, adm, aguias, leoes } = await cenario()
      const criada = corpo<Edicao>(await api.post(`${BASE}/edicoes`, adm.autorizacao, { nome: 'CB 2027', diaSemana: 0, horario: '14:00' }).expect(201))
      const nomes = { [aguias.id]: 'Águias', [leoes.id]: 'Leões' }
      const hoje = await hojeDo(clube.id)
      await api.put(`${BASE}/edicoes/${criada.id}/grupos`, adm.autorizacao, { grupos: [{ nome: 'Daniel', unidadeIds: [aguias.id] }] }).expect(200)
      const [grupo] = corpo<Grupos>(await api.put(`${BASE}/edicoes/${criada.id}/grupos`, adm.autorizacao, { grupos: [{ nome: 'Daniel', unidadeIds: [leoes.id] }] }).expect(200)).grupos
      expect(await periodos(criada.id, nomes)).toEqual([['Daniel', 'Leões', hoje, null]])
      await api.patch(`${BASE}/edicoes/${criada.id}`, adm.autorizacao, { inicio: '2027-03-07', fim: '2027-06-27' }).expect(200)
      await api.put(`${BASE}/edicoes/${criada.id}/grupos`, adm.autorizacao, { grupos: [{ id: grupo?.id, nome: 'Daniel', unidadeIds: [leoes.id] }] }).expect(200)
      expect(await periodos(criada.id, nomes)).toEqual([['Daniel', 'Leões', '2027-03-07', null]])
      await api.patch(`${BASE}/edicoes/${criada.id}`, adm.autorizacao, { inicio: '2027-03-14' }).expect(200)
      await api.post(`${BASE}/edicoes/${criada.id}/terminar`, adm.autorizacao, { datas: ['2027-03-14'] }).expect(201)
      expect(await periodos(criada.id, nomes)).toEqual([['Daniel', 'Leões', '2027-03-14', null]])
    })

    it('regra 3: unidade que saiu da outra edição terminada antes do início desta não conflita', async () => {
      const { clube, adm, aguias } = await cenario()
      const outra = await criarEdicaoCB({ clubeId: clube.id, terminada: true, nome: 'CB 1º semestre', inicio: '2027-03-07', fim: '2027-06-27' })
      await criarGrupoCB({ clubeId: clube.id, edicaoId: outra.id, unidadeIds: [aguias.id], fim: '2027-04-04' })
      const criada = await rascunho(adm.autorizacao, { inicio: '2027-06-06', fim: '2027-12-19' })
      await api.put(`${BASE}/edicoes/${criada.id}/grupos`, adm.autorizacao, { grupos: [{ nome: 'Daniel', unidadeIds: [aguias.id] }] }).expect(200)
      const grupos = corpo<Grupos>(await api.get(`${BASE}/edicoes/${criada.id}/grupos`, adm.autorizacao).expect(200))
      expect(grupos.unidades.find((u) => u.id === aguias.id)?.ocupadaPor).toEqual({ tipo: 'GRUPO', nome: 'Daniel' })
    })
  })

  describe('permissões e isolamento', () => {
    it('sem gerenciar responde 403; edição de outro clube responde 404', async () => {
      const { clube, adm } = await cenario()
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      const criada = await rascunho(adm.autorizacao)
      const id = criada.id
      await api.get(`${BASE}/edicoes`, conselheiro.autorizacao).expect(403)
      await api.post(`${BASE}/edicoes`, conselheiro.autorizacao, { nome: 'x' }).expect(403)
      await api.patch(`${BASE}/edicoes/${id}`, conselheiro.autorizacao, { nome: 'x' }).expect(403)
      await api.get(`${BASE}/edicoes/${id}/grupos`, conselheiro.autorizacao).expect(403)
      await api.put(`${BASE}/edicoes/${id}/grupos`, conselheiro.autorizacao, { grupos: [] }).expect(403)
      await api.get(`${BASE}/edicoes/${id}/datas`, conselheiro.autorizacao).expect(403)
      await api.post(`${BASE}/edicoes/${id}/terminar`, conselheiro.autorizacao, { datas: ['2027-03-07'] }).expect(403)

      const outroClube = await criarClube()
      const outroAdm = await criarAcesso({ clubeId: outroClube.id, papel: 'ADM' })
      await api.get(`${BASE}/edicoes/${id}`, outroAdm.autorizacao).expect(404)
      await api.patch(`${BASE}/edicoes/${id}`, outroAdm.autorizacao, { nome: 'x' }).expect(404)
      await api.get(`${BASE}/edicoes/${id}/grupos`, outroAdm.autorizacao).expect(404)
      await api.put(`${BASE}/edicoes/${id}/grupos`, outroAdm.autorizacao, { grupos: [] }).expect(404)
      await api.get(`${BASE}/edicoes/${id}/datas`, outroAdm.autorizacao).expect(404)
      await api.post(`${BASE}/edicoes/${id}/terminar`, outroAdm.autorizacao, { datas: ['2027-03-07'] }).expect(404)
      const lista = corpo<Lista>(await api.get(`${BASE}/edicoes`, outroAdm.autorizacao).expect(200))
      expect(lista.edicoes).toEqual([])
    })

    it('unidade de outro clube nos grupos responde 404', async () => {
      const { adm } = await cenario()
      const outroClube = await criarClube()
      const alheia = await criarUnidade({ clubeId: outroClube.id })
      const criada = await rascunho(adm.autorizacao)
      await api.put(`${BASE}/edicoes/${criada.id}/grupos`, adm.autorizacao, { grupos: [{ nome: 'D', unidadeIds: [alheia.id] }] }).expect(404)
    })
  })
})
