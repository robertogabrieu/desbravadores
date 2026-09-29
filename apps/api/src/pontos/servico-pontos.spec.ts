import { randomUUID } from 'node:crypto'
import {
  criarClube,
  criarDbv,
  criarUsuario,
  criterioPorGatilho,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoPontos, type PontoDevido } from './servico-pontos'

describe('ServicoPontos.sincronizar', () => {
  const prisma = new PrismaService()
  const servico = new ServicoPontos()

  afterAll(async () => {
    await prisma.$disconnect()
    await desconectarPrismaDeTeste()
  })

  async function cenario() {
    const clube = await criarClube()
    const dbv = await criarDbv({ clubeId: clube.id })
    const lancadoPor = await criarUsuario()
    const presenca = await criterioPorGatilho(clube.id, 'PRESENCA')
    const biblia = await criterioPorGatilho(clube.id, 'BIBLIA')
    const origemId = `${randomUUID()}:${dbv.id}`
    const sincronizar = (devidos: PontoDevido[]): Promise<void> =>
      prisma.$transaction((tx) =>
        servico.sincronizar(tx, {
          clubeId: clube.id,
          dbvId: dbv.id,
          origemTipo: 'CHAMADA',
          origemId,
          data: '2026-09-20',
          devidos,
          lancadoPorId: lancadoPor.id,
        }),
      )
    const lancamentos = () =>
      prismaDeTeste().lancamentoPontos.findMany({ where: { origemId }, orderBy: { criadoEm: 'asc' } })
    const ativos = async () => (await lancamentos()).filter((l) => l.estornadoEm === null)
    return { clube, dbv, presenca, biblia, sincronizar, lancamentos, ativos }
  }

  it('cria um lancamento por criterio devido, com data, origem e autor', async () => {
    const c = await cenario()
    await c.sincronizar([
      { criterioId: c.presenca.id, pontos: 10 },
      { criterioId: c.biblia.id, pontos: 5 },
    ])
    const ativos = await c.ativos()
    expect(ativos.map((l) => [l.criterioId, l.pontos]).sort()).toEqual(
      [[c.presenca.id, 10], [c.biblia.id, 5]].sort(),
    )
    expect(ativos[0]).toMatchObject({ clubeId: c.clube.id, dbvId: c.dbv.id, origemTipo: 'CHAMADA' })
    expect(ativos[0]?.data.toISOString().slice(0, 10)).toBe('2026-09-20')
  })

  it('sincronizar de novo o mesmo devido nao toca em nada', async () => {
    const c = await cenario()
    await c.sincronizar([{ criterioId: c.presenca.id, pontos: 10 }])
    const antes = await c.lancamentos()
    await c.sincronizar([{ criterioId: c.presenca.id, pontos: 10 }])
    expect(await c.lancamentos()).toEqual(antes)
  })

  it('mantem o valor da epoca depois que o criterio muda de pontos', async () => {
    const c = await cenario()
    await c.sincronizar([{ criterioId: c.presenca.id, pontos: 10 }])
    await prismaDeTeste().criterioRanking.update({ where: { id: c.presenca.id }, data: { pontos: 99 } })
    await c.sincronizar([
      { criterioId: c.presenca.id, pontos: 99 },
      { criterioId: c.biblia.id, pontos: 5 },
    ])
    const ativos = await c.ativos()
    expect(ativos.find((l) => l.criterioId === c.presenca.id)?.pontos).toBe(10)
    expect(ativos.find((l) => l.criterioId === c.biblia.id)?.pontos).toBe(5)
  })

  it('estorna o que deixou de ser devido, sem apagar a linha', async () => {
    const c = await cenario()
    await c.sincronizar([
      { criterioId: c.presenca.id, pontos: 10 },
      { criterioId: c.biblia.id, pontos: 5 },
    ])
    await c.sincronizar([{ criterioId: c.presenca.id, pontos: 10 }])
    const todos = await c.lancamentos()
    expect(todos).toHaveLength(2)
    const biblia = todos.find((l) => l.criterioId === c.biblia.id)
    expect(biblia?.estornadoEm).not.toBeNull()
    expect((await c.ativos()).map((l) => l.criterioId)).toEqual([c.presenca.id])
  })

  it('recria com o valor atual o que foi estornado e voltou a ser devido', async () => {
    const c = await cenario()
    await c.sincronizar([{ criterioId: c.biblia.id, pontos: 5 }])
    await c.sincronizar([])
    await c.sincronizar([{ criterioId: c.biblia.id, pontos: 8 }])
    const todos = await c.lancamentos()
    expect(todos).toHaveLength(2)
    expect((await c.ativos()).map((l) => l.pontos)).toEqual([8])
  })

  it('o desconto de falta e um lancamento sem criterio, estornado quando deixa de ser devido', async () => {
    const c = await cenario()
    await c.sincronizar([{ criterioId: null, pontos: -3 }])
    expect((await c.ativos()).map((l) => [l.criterioId, l.pontos])).toEqual([[null, -3]])
    await c.sincronizar([{ criterioId: c.presenca.id, pontos: 10 }])
    expect((await c.ativos()).map((l) => [l.criterioId, l.pontos])).toEqual([[c.presenca.id, 10]])
    expect((await c.lancamentos()).filter((l) => l.criterioId === null && l.estornadoEm !== null)).toHaveLength(1)
  })

  it('o indice do banco barra um segundo lancamento ativo do mesmo criterio ou da mesma falta', async () => {
    const c = await cenario()
    await c.sincronizar([
      { criterioId: c.presenca.id, pontos: 10 },
      { criterioId: null, pontos: -3 },
    ])
    const [modelo] = await c.ativos()
    if (!modelo) throw new Error('sem lancamento')
    const duplicar = (criterioId: string | null) =>
      prismaDeTeste().lancamentoPontos.create({
        data: {
          clubeId: c.clube.id,
          dbvId: c.dbv.id,
          criterioId,
          pontos: 1,
          data: modelo.data,
          origemTipo: 'CHAMADA',
          origemId: modelo.origemId,
          lancadoPorId: modelo.lancadoPorId,
        },
      })
    await expect(duplicar(c.presenca.id)).rejects.toThrow()
    await expect(duplicar(null)).rejects.toThrow()
  })

  it('a transacao inteira volta se uma escrita falha', async () => {
    const c = await cenario()
    await expect(
      prisma.$transaction(async (tx) => {
        await servico.sincronizar(tx, {
          clubeId: c.clube.id,
          dbvId: c.dbv.id,
          origemTipo: 'CHAMADA',
          origemId: randomUUID(),
          data: '2026-09-20',
          devidos: [{ criterioId: c.presenca.id, pontos: 10 }],
          lancadoPorId: randomUUID(),
        })
      }),
    ).rejects.toThrow()
  })
})
