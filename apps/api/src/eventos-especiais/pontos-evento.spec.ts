import type { INestApplication } from '@nestjs/common'
import type { RankingSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarClube,
  criarDbv,
  criarEvento,
  criarMembro,
  criarPresencaEvento,
  criarUnidade,
  criarUsuario,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'
import type { Prisma } from '../generated/prisma/client.js'
import { ServicoPontosEvento, type EventoDePontos } from './servico-pontos-evento'

type Ranking = z.infer<typeof RankingSaida>

describe('pontos do evento especial', () => {
  let app: INestApplication
  let pontosDoEvento: ServicoPontosEvento
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
    pontosDoEvento = app.get(ServicoPontosEvento)
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  const emTransacao = <T>(corrida: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => prismaDeTeste().$transaction(corrida)

  async function cenario(evento: { inicio?: string; fim?: string; participacao?: number; uniforme?: number } = {}) {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const unidade = await criarUnidade({ clubeId: clube.id })
    const registro = await criarEvento({
      clubeId: clube.id,
      tipo: 'EVENTO_ESPECIAL',
      inicio: evento.inicio ?? '2026-10-03',
      fim: evento.fim,
      uniforme: 'GALA',
      pontosParticipacao: evento.participacao ?? 20,
      pontosUniforme: evento.uniforme ?? 10,
    })
    const ana = await criarDbv({ clubeId: clube.id, nome: 'Ana Costa' })
    const bia = await criarDbv({ clubeId: clube.id, nome: 'Bia Souza' })
    const caio = await criarDbv({ clubeId: clube.id, nome: 'Caio Alves' })
    for (const dbv of [ana, bia, caio]) await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-02-01' })
    await criarPresencaEvento({ clubeId: clube.id, eventoId: registro.id, dbvId: ana.id, foi: true, comUniforme: true })
    await criarPresencaEvento({ clubeId: clube.id, eventoId: registro.id, dbvId: bia.id, foi: true })
    await criarPresencaEvento({ clubeId: clube.id, eventoId: registro.id, dbvId: caio.id, foi: false })
    const lancadoPorId = (await criarUsuario()).id
    return { clube, adm, unidade, evento: registro, ana, bia, caio, lancadoPorId }
  }

  async function lancamentos(clubeId: string, eventoId: string) {
    return prismaDeTeste().lancamentoPontos.findMany({
      where: { clubeId, origemTipo: 'EVENTO_ESPECIAL', origemId: { startsWith: `${eventoId}:` } },
      include: { criterio: true },
      orderBy: [{ dbvId: 'asc' }, { pontos: 'asc' }],
    })
  }

  const ativos = (linhas: Awaited<ReturnType<typeof lancamentos>>) => linhas.filter((l) => l.estornadoEm === null)
  const soma = (linhas: Awaited<ReturnType<typeof lancamentos>>, dbvId: string) =>
    ativos(linhas)
      .filter((l) => l.dbvId === dbvId)
      .reduce((total, l) => total + l.pontos, 0)

  async function eventoAtual(id: string): Promise<EventoDePontos> {
    return prismaDeTeste().eventoCalendario.findUniqueOrThrow({ where: { id } })
  }

  it('sincroniza uma pessoa: participação e uniforme com o valor do evento, origem, data de início e critério certos', async () => {
    const { clube, evento, ana, bia, caio, lancadoPorId } = await cenario()
    const pedir = (dbvId: string, foi: boolean, comUniforme: boolean) =>
      emTransacao((tx) => pontosDoEvento.sincronizar(tx, { clubeId: clube.id, evento, dbvId, foi, comUniforme, lancadoPorId }))

    await pedir(ana.id, true, true)
    await pedir(bia.id, true, false)
    await pedir(caio.id, false, false)

    const linhas = await lancamentos(clube.id, evento.id)
    expect(linhas.map((l) => [l.dbvId, l.pontos, l.criterio?.gatilho])).toEqual(
      expect.arrayContaining([
        [ana.id, 20, 'EVENTO_ESPECIAL_PARTICIPACAO'],
        [ana.id, 10, 'EVENTO_ESPECIAL_UNIFORME'],
        [bia.id, 20, 'EVENTO_ESPECIAL_PARTICIPACAO'],
      ]),
    )
    expect(linhas).toHaveLength(3)
    for (const linha of linhas) {
      expect(linha).toMatchObject({ origemTipo: 'EVENTO_ESPECIAL', lancadoPorId, estornadoEm: null })
      expect(linha.origemId).toBe(`${evento.id}:${linha.dbvId}`)
      expect(linha.data.toISOString().slice(0, 10)).toBe('2026-10-03')
    }
  })

  it('sincronizar de novo com a mesma marca não mexe nos lançamentos que existem', async () => {
    const { clube, evento, ana, lancadoPorId } = await cenario()
    const pedir = () => emTransacao((tx) => pontosDoEvento.sincronizar(tx, { clubeId: clube.id, evento, dbvId: ana.id, foi: true, comUniforme: true, lancadoPorId }))
    await pedir()
    const antes = await lancamentos(clube.id, evento.id)

    await pedir()

    expect(await lancamentos(clube.id, evento.id)).toEqual(antes)
  })

  it('quem deixou de ir, ou de usar o uniforme, tem só o que saiu estornado', async () => {
    const { clube, evento, ana, lancadoPorId } = await cenario()
    const pedir = (foi: boolean, comUniforme: boolean) =>
      emTransacao((tx) => pontosDoEvento.sincronizar(tx, { clubeId: clube.id, evento, dbvId: ana.id, foi, comUniforme, lancadoPorId }))
    await pedir(true, true)

    await pedir(true, false)
    expect(soma(await lancamentos(clube.id, evento.id), ana.id)).toBe(20)

    await pedir(false, false)
    const linhas = await lancamentos(clube.id, evento.id)
    expect(ativos(linhas)).toHaveLength(0)
    expect(linhas).toHaveLength(2)
  })

  it('refazer troca o valor por estorno e relançamento, só de quem foi', async () => {
    const { clube, evento, ana, bia, caio, lancadoPorId } = await cenario()
    expect(await emTransacao((tx) => pontosDoEvento.refazer(tx, { clubeId: clube.id, evento, lancadoPorId }))).toBe(2)
    const primeiros = await lancamentos(clube.id, evento.id)
    expect(soma(primeiros, ana.id)).toBe(30)
    await prismaDeTeste().eventoCalendario.update({ where: { id: evento.id }, data: { pontosParticipacao: 25 } })

    await emTransacao(async (tx) => pontosDoEvento.refazer(tx, { clubeId: clube.id, evento: await eventoAtual(evento.id), lancadoPorId }))

    const linhas = await lancamentos(clube.id, evento.id)
    expect(soma(linhas, ana.id)).toBe(35)
    expect(soma(linhas, bia.id)).toBe(25)
    expect(soma(linhas, caio.id)).toBe(0)
    expect(linhas.filter((l) => l.estornadoEm !== null).map((l) => l.pontos).sort()).toEqual([10, 20, 20])
  })

  it('estornar tira tudo do evento e deixa os lançamentos guardados', async () => {
    const { clube, evento, ana, bia, lancadoPorId } = await cenario()
    await emTransacao((tx) => pontosDoEvento.refazer(tx, { clubeId: clube.id, evento, lancadoPorId }))

    const estornadas = await emTransacao((tx) => pontosDoEvento.estornar(tx, { clubeId: clube.id, eventoId: evento.id, lancadoPorId }))

    expect(estornadas).toBe(2)
    const linhas = await lancamentos(clube.id, evento.id)
    expect(linhas).toHaveLength(3)
    expect(ativos(linhas)).toHaveLength(0)
    expect([soma(linhas, ana.id), soma(linhas, bia.id)]).toEqual([0, 0])
  })

  it('trocar o uniforme do evento (gala para campo) não muda os pontos de ninguém', async () => {
    const { clube, evento, ana, bia, lancadoPorId } = await cenario()
    await emTransacao((tx) => pontosDoEvento.refazer(tx, { clubeId: clube.id, evento, lancadoPorId }))
    await prismaDeTeste().eventoCalendario.update({ where: { id: evento.id }, data: { uniforme: 'CAMPO' } })

    await emTransacao(async (tx) => pontosDoEvento.refazer(tx, { clubeId: clube.id, evento: await eventoAtual(evento.id), lancadoPorId }))

    const linhas = await lancamentos(clube.id, evento.id)
    expect([soma(linhas, ana.id), soma(linhas, bia.id)]).toEqual([30, 20])
  })

  it('evento de vários dias pontua uma vez, no mês do início', async () => {
    const { clube, adm, evento, ana, lancadoPorId } = await cenario({ inicio: '2026-09-30', fim: '2026-10-02' })

    await emTransacao((tx) => pontosDoEvento.refazer(tx, { clubeId: clube.id, evento, lancadoPorId }))

    const linhas = ativos(await lancamentos(clube.id, evento.id)).filter((l) => l.dbvId === ana.id)
    expect(linhas.map((l) => l.data.toISOString().slice(0, 10))).toEqual(['2026-09-30', '2026-09-30'])
    const setembro = corpo<Ranking>(await api.get('/api/ranking?mes=2026-09', adm.autorizacao))
    const outubro = corpo<Ranking>(await api.get('/api/ranking?mes=2026-10', adm.autorizacao))
    expect(setembro.itens.find((i) => i.dbvId === ana.id)?.pontos).toBe(30)
    expect(outubro.itens.find((i) => i.dbvId === ana.id)?.pontos).toBe(0)
  })

  it('ninguém perde ponto por faltar, nem com o desconto de falta ligado no clube', async () => {
    const { clube, evento, caio, lancadoPorId } = await cenario()
    await prismaDeTeste().configuracaoClube.update({ where: { clubeId: clube.id }, data: { descontarFalta: true, pontosDescontoFalta: 5 } })

    await emTransacao((tx) => pontosDoEvento.refazer(tx, { clubeId: clube.id, evento, lancadoPorId }))

    const linhas = await lancamentos(clube.id, evento.id)
    expect(linhas.filter((l) => l.dbvId === caio.id)).toHaveLength(0)
    expect(linhas.every((l) => l.pontos > 0)).toBe(true)
  })

  it('valor 0 não gera lançamento', async () => {
    const { clube, evento, ana, bia, lancadoPorId } = await cenario({ uniforme: 0 })

    await emTransacao((tx) => pontosDoEvento.refazer(tx, { clubeId: clube.id, evento, lancadoPorId }))

    const linhas = await lancamentos(clube.id, evento.id)
    expect(linhas.map((l) => [l.dbvId, l.pontos]).sort()).toEqual([[ana.id, 20], [bia.id, 20]].sort())
  })

  it('a Diretoria que veio de DBV pontua e aparece no ranking com a unidade anterior; quem saiu do ranking não pontua', async () => {
    const { clube, adm, evento, unidade, ana, lancadoPorId } = await cenario()
    const atual = await criarUnidade({ clubeId: clube.id })
    const diretoria = await criarDbv({ clubeId: clube.id, nome: 'Dani Diretoria' })
    await criarMembro({ dbvId: diretoria.id, unidadeId: atual.id, inicio: '2026-02-01' })
    await prismaDeTeste().desbravador.update({
      where: { id: diretoria.id },
      data: { tipo: 'DIRETORIA', diretoriaVeioDeDbv: true, diretoriaDesde: new Date('2026-11-02T00:00:00Z'), diretoriaUnidadeAnteriorId: unidade.id },
    })
    await criarPresencaEvento({ clubeId: clube.id, eventoId: evento.id, dbvId: diretoria.id, foi: true })
    await prismaDeTeste().desbravador.update({ where: { id: ana.id }, data: { ativo: false } })

    await emTransacao((tx) => pontosDoEvento.refazer(tx, { clubeId: clube.id, evento, lancadoPorId }))

    const linhas = await lancamentos(clube.id, evento.id)
    expect(soma(linhas, diretoria.id)).toBe(20)
    expect(soma(linhas, ana.id)).toBe(0)
    const ranking = corpo<Ranking>(await api.get('/api/ranking?mes=2026-10', adm.autorizacao))
    expect(ranking.itens.find((i) => i.dbvId === diretoria.id)).toMatchObject({ pontos: 20, unidade: { id: unidade.id } })
  })
})
