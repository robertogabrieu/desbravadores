import { randomUUID } from 'node:crypto'
import { criarClube, criarUnidade, desconectarPrismaDeTeste } from '../../../test/fabricas'
import { ErroEscopoClube } from './guarda-clube'
import { PrismaService } from './prisma.service'
import { PrismaSistema } from './prisma-sistema'

describe('PrismaService e PrismaSistema', () => {
  const prisma = new PrismaService()
  const sistema = new PrismaSistema()

  afterAll(async () => {
    await prisma.$disconnect()
    await sistema.$disconnect()
    await desconectarPrismaDeTeste()
  })

  it('o client do PrismaService aplica a guarda de clube', async () => {
    await expect(prisma.unidade.findMany({})).rejects.toBeInstanceOf(ErroEscopoClube)
    await expect(prisma.unidade.findMany({ where: { clubeId: { in: [randomUUID()] } } })).rejects.toBeInstanceOf(
      ErroEscopoClube,
    )
  })

  it('le so o que e do clube informado', async () => {
    const a = await criarClube()
    const b = await criarClube()
    const unidadeA = await criarUnidade({ clubeId: a.id })
    await criarUnidade({ clubeId: b.id })
    const lista = await prisma.unidade.findMany({ where: { clubeId: a.id } })
    expect(lista.map((u) => u.id)).toEqual([unidadeA.id])
    expect(await prisma.unidade.findFirst({ where: { id: unidadeA.id, clubeId: b.id } })).toBeNull()
  })

  it('a guarda tambem vale dentro de uma transacao', async () => {
    await expect(prisma.$transaction((tx) => tx.unidade.findMany({}))).rejects.toBeInstanceOf(
      ErroEscopoClube,
    )
  })

  it('classe oficial so aparece com o OR exato', async () => {
    const clube = await criarClube()
    const visiveis = await prisma.classe.findMany({
      where: { OR: [{ clubeId: null }, { clubeId: clube.id }] },
    })
    expect(visiveis.length).toBeGreaterThanOrEqual(14)
    await expect(prisma.classe.findMany({})).rejects.toBeInstanceOf(ErroEscopoClube)
  })

  it('o PrismaSistema nao tem a guarda', async () => {
    const todas = await sistema.unidade.findMany({ take: 1 })
    expect(Array.isArray(todas)).toBe(true)
  })
})
