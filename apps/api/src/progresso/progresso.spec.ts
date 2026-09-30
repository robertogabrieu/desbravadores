import type { INestApplication } from '@nestjs/common'
import type { ProgressoClasseSaida, ProgressoDbvSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  configurarClube,
  criarAcesso,
  criarClube,
  criarDbv,
  criarMatricula,
  criarMembro,
  criarRequisitoConcluido,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { clienteHttp, corpo } from '../../test/p6'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'

type Classe = z.infer<typeof ProgressoClasseSaida>
type Dbv = z.infer<typeof ProgressoDbvSaida>

describe('progresso', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  // Os tokens do helper de isolamento nascem no beforeAll, com o relogio real: nao se congela para eles.
  beforeEach(() => {
    if (!expect.getState().currentTestName?.includes('isolamento entre clubes')) congelarRelogio('2026-09-30T15:00:00Z')
  })
  afterEach(() => descongelarRelogio())

  async function requisitosDaClasse(classeId: string): Promise<string[]> {
    const requisitos = await prismaDeTeste().requisito.findMany({
      where: { ativo: true, secao: { classeId } },
      select: { id: true },
      orderBy: { id: 'asc' },
    })
    return requisitos.map((requisito) => requisito.id)
  }

  async function concluir(clubeId: string, dbvId: string, requisitoIds: string[]): Promise<void> {
    for (const requisitoId of requisitoIds) await criarRequisitoConcluido({ clubeId, dbvId, requisitoId })
  }

  describe('GET /classes/:id/progresso', () => {
    it('conta o ajuste do clube no total, deixa DESISTIU fora e arredonda so na saida', async () => {
      const clube = await criarClube()
      const amigo = await classeOficial('Amigo')
      const requisitos = await requisitosDaClasse(amigo.id)
      const total = requisitos.length - 1
      const [desligado, ...ativos] = requisitos
      await prismaDeTeste().requisitoAjuste.create({ data: { clubeId: clube.id, requisitoId: desligado!, ativo: false } })
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })

      const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana' })
      const bia = await criarDbv({ clubeId: clube.id, nome: 'Bia' })
      const caio = await criarDbv({ clubeId: clube.id, nome: 'Caio' })
      for (const dbv of [ana, bia, caio]) await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id })
      await criarMatricula({ clubeId: clube.id, dbvId: (await criarDbv({ clubeId: clube.id })).id, classeId: amigo.id, status: 'DESISTIU' })
      await concluir(clube.id, ana.id, [desligado!, ...ativos.slice(0, 2)])
      await concluir(clube.id, bia.id, ativos.slice(0, 1))

      const saida = corpo<Classe>(await api.get(`/api/classes/${amigo.id}/progresso`, instrutor.autorizacao).expect(200))

      expect(saida.totalRequisitos).toBe(total)
      expect(saida.itens.map((item) => item.nome)).toEqual(['Ana', 'Bia', 'Caio'])
      const [primeiro, segundo] = saida.itens
      expect(primeiro).toMatchObject({ concluidos: 2, percentual: Math.round((2 / total) * 100), faltam: total - 2 })
      expect(segundo).toMatchObject({ concluidos: 1, percentual: Math.round((1 / total) * 100) })
      expect(saida.media).toBe(Math.round(((2 / total) * 100 + (1 / total) * 100) / 3))
    })

    it('ajuste do clube que liga um requisito inativo o inclui no total', async () => {
      const clube = await criarClube()
      const amigo = await classeOficial('Amigo')
      const requisitos = await requisitosDaClasse(amigo.id)
      const inativo = await prismaDeTeste().requisito.create({
        data: { secaoId: (await prismaDeTeste().secaoRequisito.findFirstOrThrow({ where: { classeId: amigo.id } })).id, codigo: `X${Date.now()}`, texto: 'Extra', ordem: 999, ativo: false },
      })
      await prismaDeTeste().requisitoAjuste.create({ data: { clubeId: clube.id, requisitoId: inativo.id, ativo: true } })
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const outroClube = await criarClube()
      const admDoOutro = await criarAcesso({ clubeId: outroClube.id, papel: 'ADM' })

      const saida = corpo<Classe>(await api.get(`/api/classes/${amigo.id}/progresso`, adm.autorizacao).expect(200))
      const semAjuste = corpo<Classe>(await api.get(`/api/classes/${amigo.id}/progresso`, admDoOutro.autorizacao).expect(200))

      expect(saida.totalRequisitos).toBe(requisitos.length + 1)
      expect(semAjuste.totalRequisitos).toBe(requisitos.length)
      expect(saida.media).toBeNull()
    })

    it('prontos (regular 100%), concluiram a avancada e abaixo do limiar', async () => {
      const clube = await criarClube()
      await configurarClube({ clubeId: clube.id, limiarProgressoAlerta: 40 })
      const amigo = await classeOficial('Amigo')
      const avancada = await prismaDeTeste().classe.findFirstOrThrow({ where: { classeBaseId: amigo.id, clubeId: null }, select: { id: true } })
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const pronto = await criarDbv({ clubeId: clube.id, nome: 'Pronto' })
      const baixo = await criarDbv({ clubeId: clube.id, nome: 'Baixo' })
      const investido = await criarDbv({ clubeId: clube.id, nome: 'Investido' })
      for (const [dbv, status] of [[pronto, 'CURSANDO'], [baixo, 'CURSANDO'], [investido, 'INVESTIDA']] as const) {
        await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, status })
      }
      const doAmigo = await requisitosDaClasse(amigo.id)
      await concluir(clube.id, pronto.id, doAmigo)
      await concluir(clube.id, investido.id, doAmigo)
      await concluir(clube.id, baixo.id, doAmigo.slice(0, 1))
      const formado = await criarDbv({ clubeId: clube.id, nome: 'Formado' })
      await criarMatricula({ clubeId: clube.id, dbvId: formado.id, classeId: avancada.id })
      await concluir(clube.id, formado.id, await requisitosDaClasse(avancada.id))

      const regular = corpo<Classe>(await api.get(`/api/classes/${amigo.id}/progresso`, adm.autorizacao).expect(200))
      const deAvancada = corpo<Classe>(await api.get(`/api/classes/${avancada.id}/progresso`, adm.autorizacao).expect(200))

      expect(regular.prontos).toBe(1)
      expect(regular.concluiramAvancada).toBe(0)
      expect(regular.abaixoDoLimiar).toBe(1)
      expect(regular.itens.map((item) => item.nome)).toEqual(['Investido', 'Pronto', 'Baixo'])
      expect(regular.itens.find((item) => item.nome === 'Investido')?.status).toBe('INVESTIDA')
      expect(deAvancada.prontos).toBe(0)
      expect(deAvancada.concluiramAvancada).toBe(1)
    })

    it('instrutor so da classe do vinculo (outra: 404); conselheiro 403', async () => {
      const clube = await criarClube()
      const amigo = await classeOficial('Amigo')
      const companheiro = await classeOficial('Companheiro')
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })

      await api.get(`/api/classes/${amigo.id}/progresso`, instrutor.autorizacao).expect(200)
      await api.get(`/api/classes/${companheiro.id}/progresso`, instrutor.autorizacao).expect(404)
      await api.get(`/api/classes/${amigo.id}/progresso`, conselheiro.autorizacao).expect(403)
    })
  })

  describe('GET /desbravadores/:id/progresso', () => {
    it('secoes com requisitos, quem marcou e podeMarcar por papel (conselheiro sem)', async () => {
      const clube = await criarClube()
      const amigo = await classeOficial('Amigo')
      const requisitos = await requisitosDaClasse(amigo.id)
      const unidade = await criarUnidade({ clubeId: clube.id })
      const dbv = await criarDbv({ clubeId: clube.id })
      await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-02-01' })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id })
      await concluir(clube.id, dbv.id, requisitos.slice(0, 3))
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })

      const doInstrutor = corpo<Dbv>(await api.get(`/api/desbravadores/${dbv.id}/progresso`, instrutor.autorizacao).expect(200))
      const doConselheiro = corpo<Dbv>(await api.get(`/api/desbravadores/${dbv.id}/progresso`, conselheiro.autorizacao).expect(200))

      const matricula = doInstrutor.matriculas[0]!
      expect(doInstrutor.matriculas).toHaveLength(1)
      expect(matricula).toMatchObject({ anoClube: 2026, status: 'CURSANDO', concluidos: 3, total: requisitos.length })
      expect(matricula.percentual).toBe(Math.round((3 / requisitos.length) * 100))
      const todos = matricula.secoes.flatMap((secao) => secao.requisitos)
      expect(todos).toHaveLength(requisitos.length)
      expect(todos.filter((requisito) => requisito.concluidoEm === '2026-03-01')).toHaveLength(3)
      expect(todos.every((requisito) => requisito.podeMarcar)).toBe(true)
      expect(matricula.secoes.reduce((soma, secao) => soma + secao.concluidos, 0)).toBe(3)
      expect(doConselheiro.matriculas[0]!.secoes.flatMap((secao) => secao.requisitos).some((requisito) => requisito.podeMarcar)).toBe(false)
    })

    it('B11: matricula DESISTIU e instrutor de outra classe nao alcancam (404); regular vem antes da avancada', async () => {
      const clube = await criarClube()
      const amigo = await classeOficial('Amigo')
      const avancada = await prismaDeTeste().classe.findFirstOrThrow({ where: { classeBaseId: amigo.id, clubeId: null }, select: { id: true } })
      const companheiro = await classeOficial('Companheiro')
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const doAmigo = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
      const doCompanheiro = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [companheiro.id] })
      const dbv = await criarDbv({ clubeId: clube.id })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: avancada.id })
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id })
      const desistente = await criarDbv({ clubeId: clube.id })
      await criarMatricula({ clubeId: clube.id, dbvId: desistente.id, classeId: amigo.id, status: 'DESISTIU' })

      const saida = corpo<Dbv>(await api.get(`/api/desbravadores/${dbv.id}/progresso`, adm.autorizacao).expect(200))

      expect(saida.matriculas.map((matricula) => matricula.classe.id)).toEqual([amigo.id, avancada.id])
      await api.get(`/api/desbravadores/${dbv.id}/progresso`, doCompanheiro.autorizacao).expect(404)
      await api.get(`/api/desbravadores/${desistente.id}/progresso`, doAmigo.autorizacao).expect(404)
    })

    testarIsolamento({
      titulo: 'GET /desbravadores/:id/progresso',
      app: () => app,
      papel: 'ADM',
      semear: async (clubeB) => {
        const dbv = await criarDbv({ clubeId: clubeB.id })
        return { metodo: 'get', caminho: `/api/desbravadores/${dbv.id}/progresso` }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })
  })
})
