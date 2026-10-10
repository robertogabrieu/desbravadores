import type { INestApplication } from '@nestjs/common'
import type { ProgressoClasseSaida, ProgressoDbvSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  configurarClube,
  criarAcesso,
  criarChamadaCB,
  criarClube,
  criarDbv,
  criarEdicaoCB,
  criarEncontroCB,
  criarGrupoCB,
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
type RequisitoDaFicha = Dbv['matriculas'][number]['secoes'][number]['requisitos'][number]

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
      await prismaDeTeste().requisitoAjuste.create({ data: { clubeId: clube.id, requisitoId: desligado, ativo: false } })
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })

      const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana' })
      const bia = await criarDbv({ clubeId: clube.id, nome: 'Bia' })
      const caio = await criarDbv({ clubeId: clube.id, nome: 'Caio' })
      for (const dbv of [ana, bia, caio]) await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id })
      await criarMatricula({ clubeId: clube.id, dbvId: (await criarDbv({ clubeId: clube.id })).id, classeId: amigo.id, status: 'DESISTIU' })
      await concluir(clube.id, ana.id, [desligado, ...ativos.slice(0, 2)])
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
      try {
        await prismaDeTeste().requisitoAjuste.create({ data: { clubeId: clube.id, requisitoId: inativo.id, ativo: true } })
        const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
        const outroClube = await criarClube()
        const admDoOutro = await criarAcesso({ clubeId: outroClube.id, papel: 'ADM' })

        const saida = corpo<Classe>(await api.get(`/api/classes/${amigo.id}/progresso`, adm.autorizacao).expect(200))
        const semAjuste = corpo<Classe>(await api.get(`/api/classes/${amigo.id}/progresso`, admDoOutro.autorizacao).expect(200))

        expect(saida.totalRequisitos).toBe(requisitos.length + 1)
        expect(semAjuste.totalRequisitos).toBe(requisitos.length)
        expect(saida.media).toBeNull()
      } finally {
        // Requisito oficial e compartilhado por todas as specs: o que este teste criou sai daqui.
        await prismaDeTeste().requisitoAjuste.deleteMany({ where: { requisitoId: inativo.id } })
        await prismaDeTeste().requisito.delete({ where: { id: inativo.id } })
      }
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

      const matricula = doInstrutor.matriculas[0]
      expect(doInstrutor.matriculas).toHaveLength(1)
      expect(matricula).toMatchObject({ anoClube: 2026, status: 'CURSANDO', concluidos: 3, total: requisitos.length })
      expect(matricula.percentual).toBe(Math.round((3 / requisitos.length) * 100))
      const todos = matricula.secoes.flatMap((secao) => secao.requisitos)
      expect(todos).toHaveLength(requisitos.length)
      expect(todos.filter((requisito) => requisito.concluidoEm === '2026-03-01')).toHaveLength(3)
      expect(todos.every((requisito) => requisito.podeMarcar)).toBe(true)
      expect(matricula.secoes.reduce((soma, secao) => soma + secao.concluidos, 0)).toBe(3)
      expect(doConselheiro.matriculas[0].secoes.flatMap((secao) => secao.requisitos).some((requisito) => requisito.podeMarcar)).toBe(false)
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

  describe('evidência da Classe Bíblica na ficha', () => {
    function requisito(saida: Dbv, codigo: string): RequisitoDaFicha {
      const achado = saida.matriculas[0].secoes.flatMap((secao) => secao.requisitos).find((item) => item.secaoCodigo === 'G' && item.codigo === codigo)
      if (!achado) throw new Error(`requisito ${codigo} não está na ficha`)
      return achado
    }

    /** Clube com Águias e Leões, um Adm e Lívia em Águias, matriculada em Amigo no ano do clube 2026. */
    async function cenario() {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const aguias = await criarUnidade({ clubeId: clube.id, nome: 'Águias' })
      const leoes = await criarUnidade({ clubeId: clube.id, nome: 'Leões' })
      const amigo = await classeOficial('Amigo')
      const livia = await criarDbv({ clubeId: clube.id, nome: 'Lívia' })
      await criarMembro({ dbvId: livia.id, unidadeId: aguias.id, inicio: '2026-02-01' })
      await criarMatricula({ clubeId: clube.id, dbvId: livia.id, classeId: amigo.id })
      return { clube, adm, aguias, leoes, amigo, livia }
    }

    async function ficha(dbvId: string, autorizacao: string): Promise<Dbv> {
      return corpo<Dbv>(await api.get(`/api/desbravadores/${dbvId}/progresso`, autorizacao).expect(200))
    }

    it('G6 traz a edição mais recente em destaque e as outras do ano em "Antes"; outro ano não entra; G5 sem quadro', async () => {
      const { clube, adm, aguias, livia } = await cenario()
      const clubeId = clube.id
      const linha = (presente: boolean, participou = false) => [{ dbvId: livia.id, unidadeId: aguias.id, presente, participou }]

      const primeiro = await criarEdicaoCB({ clubeId, terminada: true, nome: 'Classe Bíblica 2026 · 1º semestre', inicio: '2026-03-01', fim: '2026-06-28' })
      const ester = await criarGrupoCB({ clubeId, edicaoId: primeiro.id, unidadeIds: [aguias.id], nome: 'Grupo Ester' })
      for (const [data, presente] of [['2026-03-08', true], ['2026-03-15', false]] as const) {
        const encontro = await criarEncontroCB({ clubeId, edicaoId: primeiro.id, data })
        await criarChamadaCB({ clubeId, encontroId: encontro.id, grupoId: ester.id, linhas: linha(presente) })
      }

      const segundo = await criarEdicaoCB({ clubeId, terminada: true, nome: 'Classe Bíblica 2026 · 2º semestre', inicio: '2026-08-16', fim: '2026-12-13' })
      const daniel = await criarGrupoCB({ clubeId, edicaoId: segundo.id, unidadeIds: [aguias.id], nome: 'Grupo Daniel' })
      const chamadas: [string, boolean, boolean][] = [['2026-08-16', true, true], ['2026-08-23', true, true], ['2026-08-30', false, false]]
      for (const [data, presente, participou] of chamadas) {
        const encontro = await criarEncontroCB({ clubeId, edicaoId: segundo.id, data })
        await criarChamadaCB({ clubeId, encontroId: encontro.id, grupoId: daniel.id, linhas: linha(presente, participou) })
      }
      await criarEncontroCB({ clubeId, edicaoId: segundo.id, data: '2026-09-06' })
      const cancelado = await criarEncontroCB({ clubeId, edicaoId: segundo.id, data: '2026-09-13', cancelado: true })
      await criarChamadaCB({ clubeId, encontroId: cancelado.id, grupoId: daniel.id, linhas: linha(true, true) })

      const deOutroAno = await criarEdicaoCB({ clubeId, terminada: true, nome: 'Classe Bíblica 2025', inicio: '2025-03-02', fim: '2025-06-29' })
      const grupoAntigo = await criarGrupoCB({ clubeId, edicaoId: deOutroAno.id, unidadeIds: [aguias.id], nome: 'Grupo Rute' })
      const antigo = await criarEncontroCB({ clubeId, edicaoId: deOutroAno.id, data: '2025-03-02' })
      await criarChamadaCB({ clubeId, encontroId: antigo.id, grupoId: grupoAntigo.id, linhas: linha(true, true) })

      const saida = await ficha(livia.id, adm.autorizacao)

      const g6 = requisito(saida, 'G6')
      expect(g6.classeBiblica).toEqual({
        edicao: 'Classe Bíblica 2026 · 2º semestre',
        encontros: 3,
        presencas: 2,
        participacoes: 2,
        grupo: 'Grupo Daniel',
        semGrupo: false,
        anteriores: [{ edicao: 'Classe Bíblica 2026 · 1º semestre', encontros: 2, presencas: 1, participacoes: 0 }],
      })
      expect(g6.concluidoEm).toBeNull()
      expect(requisito(saida, 'G5').classeBiblica ?? null).toBeNull()
    })

    it('quem entrou no meio conta só os encontros em que tem linha; mover a unidade de grupo não muda o passado', async () => {
      const { clube, adm, aguias, livia } = await cenario()
      const clubeId = clube.id
      const amigo = await classeOficial('Amigo')
      const novato = await criarDbv({ clubeId, nome: 'Novato' })
      await criarMembro({ dbvId: novato.id, unidadeId: aguias.id, inicio: '2026-08-25' })
      await criarMatricula({ clubeId, dbvId: novato.id, classeId: amigo.id })

      const edicao = await criarEdicaoCB({ clubeId, terminada: true, nome: 'CB 2026', inicio: '2026-08-16', fim: '2026-12-13' })
      const daniel = await criarGrupoCB({ clubeId, edicaoId: edicao.id, unidadeIds: [aguias.id], nome: 'Grupo Daniel' })
      await criarGrupoCB({ clubeId, edicaoId: edicao.id, unidadeIds: [], nome: 'Grupo Ester' })
      for (const data of ['2026-08-16', '2026-08-23', '2026-08-30']) {
        const encontro = await criarEncontroCB({ clubeId, edicaoId: edicao.id, data })
        const linhas = [{ dbvId: livia.id, unidadeId: aguias.id, presente: true, participou: true }]
        if (data === '2026-08-30') linhas.push({ dbvId: novato.id, unidadeId: aguias.id, presente: true, participou: false })
        await criarChamadaCB({ clubeId, encontroId: encontro.id, grupoId: daniel.id, linhas })
      }
      const ester = await prismaDeTeste().grupoClasseBiblica.findFirstOrThrow({ where: { clubeId, edicaoId: edicao.id, nome: 'Grupo Ester' } })
      await prismaDeTeste().grupoUnidadeClasseBiblica.updateMany({ where: { clubeId, edicaoId: edicao.id, unidadeId: aguias.id }, data: { grupoId: ester.id } })

      const daLivia = requisito(await ficha(livia.id, adm.autorizacao), 'G6').classeBiblica
      const doNovato = requisito(await ficha(novato.id, adm.autorizacao), 'G6').classeBiblica

      expect(daLivia).toMatchObject({ encontros: 3, presencas: 3, participacoes: 3, grupo: 'Grupo Daniel', semGrupo: false })
      expect(doNovato).toMatchObject({ encontros: 1, presencas: 1, participacoes: 0, grupo: 'Grupo Daniel', semGrupo: false })
    })

    it('sem linha no ano: semGrupo quando a unidade atual não está em grupo da edição em andamento; senão, sem quadro', async () => {
      const { clube, adm, aguias, leoes, amigo, livia } = await cenario()
      const clubeId = clube.id
      expect(requisito(await ficha(livia.id, adm.autorizacao), 'G6').classeBiblica ?? null).toBeNull()

      const edicao = await criarEdicaoCB({ clubeId, terminada: true, nome: 'CB 2026', inicio: '2026-08-16', fim: '2026-12-13' })
      await criarGrupoCB({ clubeId, edicaoId: edicao.id, unidadeIds: [leoes.id], nome: 'Grupo Daniel' })
      const rascunho = await criarEdicaoCB({ clubeId, nome: 'Rascunho', inicio: '2026-08-16', fim: '2026-12-13' })
      await criarGrupoCB({ clubeId, edicaoId: rascunho.id, unidadeIds: [aguias.id] })
      const leao = await criarDbv({ clubeId, nome: 'Leão' })
      await criarMembro({ dbvId: leao.id, unidadeId: leoes.id, inicio: '2026-02-01' })
      await criarMatricula({ clubeId, dbvId: leao.id, classeId: amigo.id })

      expect(requisito(await ficha(livia.id, adm.autorizacao), 'G6').classeBiblica).toEqual({
        edicao: 'CB 2026', encontros: 0, presencas: 0, participacoes: 0, grupo: null, semGrupo: true, anteriores: [],
      })
      expect(requisito(await ficha(leao.id, adm.autorizacao), 'G6').classeBiblica ?? null).toBeNull()
    })

    it('edição encerrada não conta como em andamento para o semGrupo', async () => {
      const { clube, adm, leoes, livia } = await cenario()
      const encerrada = await criarEdicaoCB({ clubeId: clube.id, terminada: true, nome: 'CB 1º semestre', inicio: '2026-03-01', fim: '2026-06-28' })
      await criarGrupoCB({ clubeId: clube.id, edicaoId: encerrada.id, unidadeIds: [leoes.id] })

      expect(requisito(await ficha(livia.id, adm.autorizacao), 'G6').classeBiblica ?? null).toBeNull()
    })

    it('não conta edição de outro clube', async () => {
      const { adm, livia } = await cenario()
      const outro = await criarClube()
      const unidade = await criarUnidade({ clubeId: outro.id })
      const edicao = await criarEdicaoCB({ clubeId: outro.id, terminada: true, nome: 'De outro clube', inicio: '2026-08-16', fim: '2026-12-13' })
      await criarGrupoCB({ clubeId: outro.id, edicaoId: edicao.id, unidadeIds: [unidade.id] })

      expect(requisito(await ficha(livia.id, adm.autorizacao), 'G6').classeBiblica ?? null).toBeNull()
    })
  })
})
