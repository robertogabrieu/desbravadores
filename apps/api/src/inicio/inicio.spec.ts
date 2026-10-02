import type { INestApplication } from '@nestjs/common'
import type { InicioConselheiroSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarClube,
  criarDbv,
  criarLancamento,
  criarMembro,
  criarEvento,
  criarReuniao,
  criarUnidade,
  configurarClube,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'

type Inicio = z.infer<typeof InicioConselheiroSaida>

// 2026-09-27 e domingo; 28 e segunda; 26 e sabado.
const SABADO_MEIO_DIA = '2026-09-26T15:00:00Z'
const DOMINGO_MEIO_DIA = '2026-09-27T15:00:00Z'
const SEGUNDA_01H_UTC = '2026-09-28T01:00:00Z'

describe('inicio do conselheiro', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  afterEach(() => descongelarRelogio())

  async function conselheiroComUnidade(nomeDaUnidade?: string) {
    const clube = await criarClube()
    const unidade = await criarUnidade({ clubeId: clube.id, nome: nomeDaUnidade })
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
    return { clube, unidade, conselheiro }
  }

  describe('proxima reuniao', () => {
    it('domingo e hoje: data de hoje, horario e local do clube, sem chamada feita', async () => {
      congelarRelogio(DOMINGO_MEIO_DIA)
      const { clube, unidade, conselheiro } = await conselheiroComUnidade()
      await configurarClube({ clubeId: clube.id, horaReuniao: '09:30', localReuniaoPadrao: 'Sede do clube' })

      const resposta = await api.get('/api/inicio/conselheiro', conselheiro.autorizacao)

      expect(resposta.status).toBe(200)
      const saida = corpo<Inicio>(resposta)
      expect(saida.unidade?.id).toBe(unidade.id)
      expect(saida.proximaReuniao).toEqual({
        data: '2026-09-27',
        horario: '09:30',
        local: 'Sede do clube',
        ehHoje: true,
        chamadaFeita: false,
        nome: null,
      })
      expect(saida.feriasAte).toBeNull()
    })

    it('sabado: a proxima e amanha', async () => {
      congelarRelogio(SABADO_MEIO_DIA)
      const { conselheiro } = await conselheiroComUnidade()

      const saida = corpo<Inicio>(await api.get('/api/inicio/conselheiro', conselheiro.autorizacao))

      expect(saida.proximaReuniao).toMatchObject({ data: '2026-09-27', ehHoje: false })
    })

    it('fuso: 01:00 UTC de segunda ainda e domingo em Brasilia', async () => {
      congelarRelogio(SEGUNDA_01H_UTC)
      const { conselheiro } = await conselheiroComUnidade()

      const saida = corpo<Inicio>(await api.get('/api/inicio/conselheiro', conselheiro.autorizacao))

      expect(saida.proximaReuniao).toMatchObject({ data: '2026-09-27', ehHoje: true })
    })

    it('domingo ja passou na semana: a proxima e o domingo seguinte', async () => {
      congelarRelogio('2026-09-29T15:00:00Z')
      const { conselheiro } = await conselheiroComUnidade()

      const saida = corpo<Inicio>(await api.get('/api/inicio/conselheiro', conselheiro.autorizacao))

      expect(saida.proximaReuniao).toMatchObject({ data: '2026-10-04', ehHoje: false })
    })

    it('respeita o dia da semana configurado e o local ausente vira null', async () => {
      congelarRelogio(DOMINGO_MEIO_DIA)
      const { clube, conselheiro } = await conselheiroComUnidade()
      await configurarClube({ clubeId: clube.id, diaReuniao: 3 })

      const saida = corpo<Inicio>(await api.get('/api/inicio/conselheiro', conselheiro.autorizacao))

      expect(saida.proximaReuniao).toMatchObject({ data: '2026-09-30', local: null, ehHoje: false })
    })

    it('chamadaFeita so conta a reuniao da unidade selecionada nessa data', async () => {
      congelarRelogio(DOMINGO_MEIO_DIA)
      const { clube, unidade } = await conselheiroComUnidade()
      const outra = await criarUnidade({ clubeId: clube.id })
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id, outra.id] })
      await criarReuniao({ unidadeId: outra.id, data: '2026-09-27' })

      const semChamada = corpo<Inicio>(await api.get(`/api/inicio/conselheiro?unidadeId=${unidade.id}`, conselheiro.autorizacao))
      await criarReuniao({ unidadeId: unidade.id, data: '2026-09-27' })
      const comChamada = corpo<Inicio>(await api.get(`/api/inicio/conselheiro?unidadeId=${unidade.id}`, conselheiro.autorizacao))

      expect(semChamada.proximaReuniao?.chamadaFeita).toBe(false)
      expect(comChamada.proximaReuniao?.chamadaFeita).toBe(true)
    })

    describe('pelo calendario', () => {
      async function eventoNoClube(clubeId: string, dados: Omit<Parameters<typeof criarEvento>[0], 'clubeId'>, extras: { nome?: string; horario?: string | null; local?: string | null } = {}) {
        const evento = await criarEvento({ clubeId, ...dados })
        if (Object.keys(extras).length > 0) await prismaDeTeste().eventoCalendario.update({ where: { id: evento.id }, data: extras })
        return evento
      }

      it('hoje em ferias: a proxima e o domingo depois do fim e feriasAte e o fim das ferias', async () => {
        congelarRelogio(DOMINGO_MEIO_DIA)
        const { clube, conselheiro } = await conselheiroComUnidade()
        await eventoNoClube(clube.id, { tipo: 'FERIAS', inicio: '2026-09-20', fim: '2026-10-02' })

        const saida = corpo<Inicio>(await api.get('/api/inicio/conselheiro', conselheiro.autorizacao))

        expect(saida.proximaReuniao).toMatchObject({ data: '2026-10-04', ehHoje: false, nome: null })
        expect(saida.feriasAte).toBe('2026-10-02')
      })

      it('extra numa quarta antes do domingo: data, nome, horario e local da extra; campo nulo cai no do clube', async () => {
        congelarRelogio('2026-09-24T15:00:00Z')
        const { clube, conselheiro } = await conselheiroComUnidade()
        await configurarClube({ clubeId: clube.id, horaReuniao: '09:30', localReuniaoPadrao: 'Sede do clube' })
        await eventoNoClube(clube.id, { tipo: 'REUNIAO_EXTRA', inicio: '2026-09-25' }, { nome: 'Encontro de inicio', horario: '15:00', local: null })

        const saida = corpo<Inicio>(await api.get('/api/inicio/conselheiro', conselheiro.autorizacao))

        expect(saida.proximaReuniao).toMatchObject({ data: '2026-09-25', nome: 'Encontro de inicio', horario: '15:00', local: 'Sede do clube', ehHoje: false })
      })

      it('extra no dia de hoje: ehHoje e chamadaFeita pela reuniao gravada nessa data', async () => {
        congelarRelogio(SABADO_MEIO_DIA)
        const { clube, unidade, conselheiro } = await conselheiroComUnidade()
        await eventoNoClube(clube.id, { tipo: 'REUNIAO_EXTRA', inicio: '2026-09-26' }, { nome: 'Extra de sabado' })
        await criarReuniao({ unidadeId: unidade.id, data: '2026-09-26' })

        const saida = corpo<Inicio>(await api.get('/api/inicio/conselheiro', conselheiro.autorizacao))

        expect(saida.proximaReuniao).toMatchObject({ data: '2026-09-26', ehHoje: true, chamadaFeita: true, nome: 'Extra de sabado' })
      })

      it('nada em 120 dias: proximaReuniao null e feriasAte preenchido', async () => {
        congelarRelogio(DOMINGO_MEIO_DIA)
        const { clube, conselheiro } = await conselheiroComUnidade()
        await eventoNoClube(clube.id, { tipo: 'FERIAS', inicio: '2026-09-20', fim: '2027-03-15' })

        const saida = corpo<Inicio>(await api.get('/api/inicio/conselheiro', conselheiro.autorizacao))

        expect(saida.proximaReuniao).toBeNull()
        expect(saida.feriasAte).toBe('2027-03-15')
      })

      it('evento de outro clube e evento removido nao contam', async () => {
        congelarRelogio(DOMINGO_MEIO_DIA)
        const { clube, conselheiro } = await conselheiroComUnidade()
        const outroClube = await criarClube()
        await eventoNoClube(outroClube.id, { tipo: 'FERIAS', inicio: '2026-09-20', fim: '2026-10-30' })
        const removido = await eventoNoClube(clube.id, { tipo: 'FERIAS', inicio: '2026-09-20', fim: '2026-10-30' })
        await prismaDeTeste().eventoCalendario.update({ where: { id: removido.id }, data: { removidoEm: new Date() } })

        const saida = corpo<Inicio>(await api.get('/api/inicio/conselheiro', conselheiro.autorizacao))

        expect(saida.proximaReuniao).toMatchObject({ data: '2026-09-27', nome: null })
        expect(saida.feriasAte).toBeNull()
      })
    })
  })

  describe('numeros e destaques da unidade', () => {
    it('total de DBVs, frequencia do mes, posicao da unidade e top 3 (so quem pontuou)', async () => {
      congelarRelogio(DOMINGO_MEIO_DIA)
      const clube = await criarClube()
      const minha = await criarUnidade({ clubeId: clube.id, nome: 'Minha' })
      const rival = await criarUnidade({ clubeId: clube.id, nome: 'Rival' })
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [minha.id] })
      const nomes = ['Ana Costa', 'Bia Souza', 'Caio Alves', 'Davi Rocha', 'Eva Lima']
      const dbvs = []
      for (const nome of nomes) {
        const dbv = await criarDbv({ clubeId: clube.id, nome })
        await criarMembro({ dbvId: dbv.id, unidadeId: minha.id, inicio: '2026-02-01' })
        dbvs.push(dbv)
      }
      const [ana, bia, caio, davi] = dbvs
      const inativo = await criarDbv({ clubeId: clube.id, nome: 'Inativo Fora', ativo: false })
      await criarMembro({ dbvId: inativo.id, unidadeId: minha.id, inicio: '2026-02-01' })
      const doRival = await criarDbv({ clubeId: clube.id, nome: 'Rival Um' })
      await criarMembro({ dbvId: doRival.id, unidadeId: rival.id, inicio: '2026-02-01' })

      const pontos: [typeof ana, number][] = [[ana, 5], [bia, 30], [caio, 20], [davi, 10]]
      for (const [dbv, valor] of pontos) {
        await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: valor, data: '2026-09-06' })
      }
      await criarLancamento({ clubeId: clube.id, dbvId: doRival.id, pontos: 100, data: '2026-09-06' })
      await criarLancamento({ clubeId: clube.id, dbvId: bia.id, pontos: 400, data: '2026-08-30' })
      await criarReuniao({
        unidadeId: minha.id,
        data: '2026-09-06',
        chamada: [
          { dbvId: ana.id, situacao: 'PRESENTE' },
          { dbvId: bia.id, situacao: 'PRESENTE' },
          { dbvId: caio.id, situacao: 'FALTA' },
          { dbvId: davi.id, situacao: 'ATRASADO' },
        ],
      })
      await criarReuniao({ unidadeId: rival.id, data: '2026-09-06', chamada: [{ dbvId: doRival.id, situacao: 'FALTA' }] })

      const saida = corpo<Inicio>(await api.get('/api/inicio/conselheiro', conselheiro.autorizacao))

      expect(saida.totalDbvs).toBe(5)
      expect(saida.frequenciaMes).toBe(75)
      // media da minha: 65/5 = 13; do rival: 100
      expect(saida.posicaoUnidade).toEqual({ posicao: 2, total: 2 })
      expect(saida.destaques).toEqual([
        { posicao: 1, dbvId: bia.id, nome: 'Bia Souza', pontos: 30 },
        { posicao: 2, dbvId: caio.id, nome: 'Caio Alves', pontos: 20 },
        { posicao: 3, dbvId: davi.id, nome: 'Davi Rocha', pontos: 10 },
      ])
    })

    it('unidade sem reuniao no mes: frequencia nula; sem pontuacao: sem destaques', async () => {
      congelarRelogio(DOMINGO_MEIO_DIA)
      const { clube, unidade, conselheiro } = await conselheiroComUnidade()
      const dbv = await criarDbv({ clubeId: clube.id })
      await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-02-01' })

      const saida = corpo<Inicio>(await api.get('/api/inicio/conselheiro', conselheiro.autorizacao))

      expect(saida).toMatchObject({ totalDbvs: 1, frequenciaMes: null, destaques: [] })
      expect(saida.posicaoUnidade).toEqual({ posicao: 1, total: 1 })
    })
  })

  describe('selecao de unidade', () => {
    it('sem filtro, a primeira por nome; com filtro, a escolhida; unidades traz todas as dele', async () => {
      const clube = await criarClube()
      const beta = await criarUnidade({ clubeId: clube.id, nome: 'Beta' })
      const alfa = await criarUnidade({ clubeId: clube.id, nome: 'Alfa' })
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [beta.id, alfa.id] })

      const padrao = corpo<Inicio>(await api.get('/api/inicio/conselheiro', conselheiro.autorizacao))
      const escolhida = corpo<Inicio>(await api.get(`/api/inicio/conselheiro?unidadeId=${beta.id}`, conselheiro.autorizacao))

      expect(padrao.unidade?.id).toBe(alfa.id)
      expect(escolhida.unidade?.id).toBe(beta.id)
      expect(padrao.unidades.map((u) => u.id)).toEqual([alfa.id, beta.id])
    })

    it('unidade que nao e dele (do clube ou de outro): 404', async () => {
      const { clube, conselheiro } = await conselheiroComUnidade()
      const doMesmoClube = await criarUnidade({ clubeId: clube.id })
      const outroClube = await criarClube()
      const deFora = await criarUnidade({ clubeId: outroClube.id })

      for (const id of [doMesmoClube.id, deFora.id]) {
        const resposta = await api.get(`/api/inicio/conselheiro?unidadeId=${id}`, conselheiro.autorizacao)
        expect(resposta.status).toBe(404)
        expect(resposta.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
      }
    })

    it('conselheiro sem unidade: tudo vazio', async () => {
      const clube = await criarClube()
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })

      const resposta = await api.get('/api/inicio/conselheiro', conselheiro.autorizacao)

      expect(resposta.status).toBe(200)
      expect(corpo<Inicio>(resposta)).toEqual({
        unidade: null,
        unidades: [],
        proximaReuniao: null,
        feriasAte: null,
        totalDbvs: 0,
        frequenciaMes: null,
        posicaoUnidade: null,
        destaques: [],
      })
    })
  })

  describe('papel', () => {
    it.each(['ADM', 'INSTRUTOR'] as const)('%s recebe 403', async (papel) => {
      const clube = await criarClube()
      const acesso = await criarAcesso({ clubeId: clube.id, papel })

      const resposta = await api.get('/api/inicio/conselheiro', acesso.autorizacao)

      expect(resposta.status).toBe(403)
      expect(resposta.body).toMatchObject({ codigo: 'SEM_PERMISSAO' })
    })

    it('sem login, 401', async () => {
      expect((await api.get('/api/inicio/conselheiro', '')).status).toBe(401)
    })
  })

  describe('isolamento entre clubes', () => {
    it('unidade do clube B na consulta do conselheiro do clube A: 404 e nada do B vaza', async () => {
      const { conselheiro } = await conselheiroComUnidade()
      const clubeB = await criarClube()
      const unidadeB = await criarUnidade({ clubeId: clubeB.id, nome: 'Unidade Secreta B' })
      const dbvB = await criarDbv({ clubeId: clubeB.id, nome: 'Dbv Secreto B' })
      await criarMembro({ dbvId: dbvB.id, unidadeId: unidadeB.id, inicio: '2026-01-01' })

      const resposta = await api.get(`/api/inicio/conselheiro?unidadeId=${unidadeB.id}`, conselheiro.autorizacao)

      expect(resposta.status).toBe(404)
      expect(JSON.stringify(resposta.body)).not.toContain('Secret')
    })

    it('a resposta do conselheiro do clube A nao traz nada do clube B mesmo com dados nos dois', async () => {
      const { conselheiro } = await conselheiroComUnidade()
      const clubeB = await criarClube()
      const unidadeB = await criarUnidade({ clubeId: clubeB.id, nome: 'Unidade Secreta B' })
      const dbvB = await criarDbv({ clubeId: clubeB.id, nome: 'Dbv Secreto B' })
      await criarMembro({ dbvId: dbvB.id, unidadeId: unidadeB.id, inicio: '2026-01-01' })
      await criarLancamento({ clubeId: clubeB.id, dbvId: dbvB.id, pontos: 50, data: '2026-09-01' })

      const resposta = await api.get('/api/inicio/conselheiro', conselheiro.autorizacao)

      expect(resposta.status).toBe(200)
      expect(JSON.stringify(resposta.body)).not.toContain('Secret')
    })
  })
})
