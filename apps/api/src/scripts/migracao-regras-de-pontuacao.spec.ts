import type { INestApplication } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'
import type { RankingSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarClube,
  criarDbv,
  criarLancamento,
  criarMembro,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'

type Ranking = z.infer<typeof RankingSaida>

const MIGRACAO = resolve(__dirname, '../../prisma/migrations/20261012130000_regras_de_pontuacao/migration.sql')
const SQL = readFileSync(MIGRACAO, 'utf8')
const CHECK = 'lancamento_pontos_nao_negativo'
const COLUNAS_REMOVIDAS = ['descontarFalta', 'pontosDescontoFalta', 'rankingPeriodo', 'rankingNoLogin', 'rankingPorUnidade']

describe('migracao regras_de_pontuacao (SPEC 7, item 7)', () => {
  const prisma = prismaDeTeste()
  let app: INestApplication
  const api = clienteHttp(() => app)
  let pg: Client

  beforeAll(async () => {
    app = await criarAppDeTeste()
    pg = new Client({ connectionString: process.env.DATABASE_URL })
    await pg.connect()
  })

  afterAll(async () => {
    await pg.end()
    await app.close()
    await desconectarPrismaDeTeste()
  })

  // Protocolo simples do pg: o arquivo inteiro (inclusive o DO $$) vai de uma vez.
  const aplicarMigracao = async (): Promise<void> => {
    await pg.query(SQL)
  }
  const semCheck = async (): Promise<void> => {
    await pg.query(`ALTER TABLE "LancamentoPontos" DROP CONSTRAINT IF EXISTS "${CHECK}"`)
  }
  const dbvNaUnidade = async (clubeId: string, nome: string) => {
    const unidade = await criarUnidade({ clubeId })
    const dbv = await criarDbv({ clubeId, nome })
    await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-02-01' })
    return dbv
  }
  const criterioManual = async (clubeId: string, padrao: boolean, nome: string) => {
    if (padrao) {
      const existente = await prisma.criterioRanking.findFirst({ where: { clubeId, gatilho: 'MANUAL', padrao: true } })
      if (existente) return existente
    }
    return prisma.criterioRanking.create({
      data: { clubeId, nome, pontos: 5, ordem: 99, gatilho: 'MANUAL', lancadoPor: 'CONSELHEIRO', padrao },
    })
  }

  // Recria o CHECK para o proximo teste, mesmo que o corpo tenha parado no meio.
  afterEach(aplicarMigracao)

  it('1. sem lancamento negativo, reaplicar nao altera nenhum lancamento e nao falha', async () => {
    const clube = await criarClube()
    const dbv = await dbvNaUnidade(clube.id, 'Sem Negativo')
    const ativo = await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: 10, data: '2026-03-02' })
    const estornado = await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: 7, data: '2026-03-03', estornado: true })
    const antes = await prisma.lancamentoPontos.findMany({ orderBy: { id: 'asc' } })

    await aplicarMigracao()

    expect(await prisma.lancamentoPontos.findMany({ orderBy: { id: 'asc' } })).toEqual(antes)
    expect(antes.find((l) => l.id === ativo.id)?.estornadoEm).toBeNull()
    expect(antes.find((l) => l.id === estornado.id)?.estornadoEm).not.toBeNull()
  })

  it('2. estorna os lancamentos ativos negativos e o ranking nao os soma', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const dbv = await dbvNaUnidade(clube.id, 'Com Negativo')
    await semCheck()
    const positivo = await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: 30, data: '2026-03-01' })
    const n1 = await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: -10, data: '2026-03-02' })
    const n2 = await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: -5, data: '2026-03-03' })
    const jaEstornado = await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: -4, data: '2026-03-04', estornado: true })
    const estornoAntigo = (await prisma.lancamentoPontos.findUniqueOrThrow({ where: { id: jaEstornado.id } })).estornadoEm

    await aplicarMigracao()

    const lidos = await prisma.lancamentoPontos.findMany({ where: { id: { in: [positivo.id, n1.id, n2.id, jaEstornado.id] } } })
    const porId = new Map(lidos.map((l) => [l.id, l]))
    expect(porId.get(n1.id)?.estornadoEm).not.toBeNull()
    expect(porId.get(n2.id)?.estornadoEm).not.toBeNull()
    expect(porId.get(positivo.id)?.estornadoEm).toBeNull()
    expect(porId.get(jaEstornado.id)?.estornadoEm).toEqual(estornoAntigo)

    const saida = corpo<Ranking>(await api.get('/api/ranking?mes=2026-03', adm.autorizacao))
    expect(saida.itens.find((i) => i.dbvId === dbv.id)?.pontos).toBe(30)
  })

  it('3. apaga o MANUAL padrao sem lancamento e preserva o referenciado (ativo ou estornado)', async () => {
    const semUso = await criarClube()
    const comAtivo = await criarClube()
    const comEstornado = await criarClube()
    const criterioSemUso = await criterioManual(semUso.id, true, 'Participação em evento')
    const criterioAtivo = await criterioManual(comAtivo.id, true, 'Participação em evento')
    const criterioEstornado = await criterioManual(comEstornado.id, true, 'Participação em evento')
    const manualAvulso = await criterioManual(semUso.id, false, 'Outro manual')
    const dbvA = await dbvNaUnidade(comAtivo.id, 'Com Ativo')
    const dbvE = await dbvNaUnidade(comEstornado.id, 'Com Estornado')
    await criarLancamento({ clubeId: comAtivo.id, dbvId: dbvA.id, pontos: 5, data: '2026-03-02', criterioId: criterioAtivo.id })
    await criarLancamento({
      clubeId: comEstornado.id,
      dbvId: dbvE.id,
      pontos: 5,
      data: '2026-03-02',
      criterioId: criterioEstornado.id,
      estornado: true,
    })

    await aplicarMigracao()

    const existe = async (id: string): Promise<boolean> => (await prisma.criterioRanking.count({ where: { id } })) === 1
    expect(await existe(criterioSemUso.id)).toBe(false)
    expect(await existe(criterioAtivo.id)).toBe(true)
    expect(await existe(criterioEstornado.id)).toBe(true)
    expect(await existe(manualAvulso.id)).toBe(true)
  })

  it('4. depois da migracao, negativo e barrado pelo CHECK, zero e positivo passam, e reaplicar nao falha', async () => {
    const clube = await criarClube()
    const dbv = await dbvNaUnidade(clube.id, 'Check')
    await semCheck()
    await aplicarMigracao()
    await aplicarMigracao()

    await expect(criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: -1, data: '2026-03-02' })).rejects.toThrow(CHECK)
    await expect(criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: 0, data: '2026-03-03' })).resolves.toMatchObject({ pontos: 0 })
    await expect(criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: 3, data: '2026-03-04' })).resolves.toMatchObject({ pontos: 3 })
    const { rows } = await pg.query('SELECT 1 FROM pg_constraint WHERE conname = $1', [CHECK])
    expect(rows).toHaveLength(1)
  })

  it('5. as colunas de ranking/desconto e o tipo PeriodoRanking nao existem mais', async () => {
    const colunas = await pg.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'ConfiguracaoClube' AND column_name = ANY($1)`,
      [COLUNAS_REMOVIDAS],
    )
    expect(colunas.rows).toEqual([])
    const tipo = await pg.query(`SELECT 1 FROM pg_type WHERE typname = 'PeriodoRanking'`)
    expect(tipo.rows).toEqual([])
  })

  it('6. criterio com pontos negativos (dado antigo) vira 0 e reaplicar nao falha', async () => {
    const clube = await criarClube()
    const negativo = await prisma.criterioRanking.create({
      data: { clubeId: clube.id, nome: 'Antigo negativo', pontos: 5, ordem: 98, gatilho: 'MANUAL', lancadoPor: 'CONSELHEIRO', padrao: false },
    })
    const positivo = await prisma.criterioRanking.create({
      data: { clubeId: clube.id, nome: 'Positivo', pontos: 7, ordem: 97, gatilho: 'MANUAL', lancadoPor: 'CONSELHEIRO', padrao: false },
    })
    // O Prisma/validacao nao deixa gravar negativo: o dado antigo entra por SQL cru.
    await pg.query('UPDATE "CriterioRanking" SET "pontos" = -5 WHERE "id" = $1', [negativo.id])

    await aplicarMigracao()
    await aplicarMigracao()

    expect((await prisma.criterioRanking.findUniqueOrThrow({ where: { id: negativo.id } })).pontos).toBe(0)
    expect((await prisma.criterioRanking.findUniqueOrThrow({ where: { id: positivo.id } })).pontos).toBe(7)
  })
})
