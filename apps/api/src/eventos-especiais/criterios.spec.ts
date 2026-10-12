import { criarClube, desconectarPrismaDeTeste, prismaDeTeste } from '../../test/fabricas'
import { garantirCriteriosDeEvento } from './criterios'

const GATILHOS = ['EVENTO_ESPECIAL_PARTICIPACAO', 'EVENTO_ESPECIAL_UNIFORME'] as const

async function criteriosDeEvento(clubeId: string) {
  return prismaDeTeste().criterioRanking.findMany({
    where: { clubeId, gatilho: { in: [...GATILHOS] } },
    orderBy: { gatilho: 'asc' },
  })
}

function garantir(clubeId: string): Promise<void> {
  return prismaDeTeste().$transaction((tx) => garantirCriteriosDeEvento(tx, clubeId))
}

describe('critérios do evento especial', () => {
  afterAll(() => desconectarPrismaDeTeste())

  it('cria os dois critérios padrão num clube novo, ativos, com 0 ponto e lançados pelo Adm', async () => {
    const clube = await criarClube()
    expect(await criteriosDeEvento(clube.id)).toHaveLength(0)

    await garantir(clube.id)

    const criterios = await criteriosDeEvento(clube.id)
    expect(criterios.map((c) => [c.gatilho, c.nome])).toEqual([
      ['EVENTO_ESPECIAL_PARTICIPACAO', 'Participação em evento especial'],
      ['EVENTO_ESPECIAL_UNIFORME', 'Uniforme em evento especial'],
    ])
    for (const criterio of criterios) {
      expect(criterio).toMatchObject({ padrao: true, ativo: true, pontos: 0, lancadoPor: 'ADM' })
    }
  })

  it('é idempotente: chamar de novo, ou duas vezes ao mesmo tempo, não cria outro', async () => {
    const clube = await criarClube()

    await garantir(clube.id)
    await garantir(clube.id)
    await Promise.all([garantir(clube.id), garantir(clube.id), garantir(clube.id)])

    expect(await criteriosDeEvento(clube.id)).toHaveLength(2)
  })

  it('serve ao clube que já existia: não mexe nos critérios que ele já tinha e põe os novos no fim da ordem', async () => {
    const clube = await criarClube()
    const antes = await prismaDeTeste().criterioRanking.findMany({ where: { clubeId: clube.id }, orderBy: { ordem: 'asc' } })
    expect(antes.length).toBeGreaterThan(0)
    const maiorOrdem = Math.max(...antes.map((c) => c.ordem))

    await garantir(clube.id)

    const depois = await prismaDeTeste().criterioRanking.findMany({ where: { clubeId: clube.id }, orderBy: { ordem: 'asc' } })
    expect(depois).toHaveLength(antes.length + 2)
    expect(depois.filter((c) => antes.some((a) => a.id === c.id))).toEqual(antes)
    const novos = depois.filter((c) => !antes.some((a) => a.id === c.id))
    expect(novos.map((c) => c.ordem)).toEqual([maiorOrdem + 1, maiorOrdem + 2])
  })

  it('não herda o sufixo da Classe Bíblica quando o nome já está tomado por um critério que não é padrão', async () => {
    const clube = await criarClube()
    await prismaDeTeste().criterioRanking.create({
      data: {
        clubeId: clube.id,
        nome: 'Participação em evento especial',
        pontos: 3,
        ordem: 900,
        gatilho: 'MANUAL',
        lancadoPor: 'ADM',
        padrao: false,
      },
    })

    await garantir(clube.id)

    const participacao = (await criteriosDeEvento(clube.id)).find((c) => c.gatilho === 'EVENTO_ESPECIAL_PARTICIPACAO')
    expect(participacao?.nome).toBe('Participação em evento especial 2')
    expect(participacao?.nome).not.toContain('Classe Bíblica')
  })

  it('o critério padrão que já existe é reaproveitado, mesmo renomeado ou desativado', async () => {
    const clube = await criarClube()
    await garantir(clube.id)
    const [participacao] = await criteriosDeEvento(clube.id)
    await prismaDeTeste().criterioRanking.update({ where: { id: participacao?.id ?? '' }, data: { nome: 'Outro nome', ativo: false } })

    await garantir(clube.id)

    const criterios = await criteriosDeEvento(clube.id)
    expect(criterios).toHaveLength(2)
    expect(criterios.find((c) => c.id === participacao?.id)).toMatchObject({ nome: 'Outro nome', ativo: false })
  })
})
