import type { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import type { Prisma } from '../generated/prisma/client.js'

type Banco = Prisma.TransactionClient | PrismaService

export interface ContagemDoDbv { encontros: number; presencas: number; participacoes: number; grupoId: string; grupoNome: string }

/** Por desbravador, só com as linhas gravadas (regra 13): Y = linhas em encontros não cancelados com chamada registrada. */
export async function contarPorDbv(db: Banco, clubeId: string, edicaoId: string, dbvIds?: string[]): Promise<Map<string, ContagemDoDbv>> {
  const linhas = await db.presencaClasseBiblica.findMany({
    where: {
      clubeId,
      ...(dbvIds ? { dbvId: { in: dbvIds } } : {}),
      encontro: { clubeId, edicaoId, canceladoEm: null, chamadas: { some: { clubeId } } },
    },
    select: {
      dbvId: true,
      presente: true,
      participou: true,
      grupoId: true,
      grupo: { select: { nome: true } },
      encontro: { select: { data: true } },
    },
    orderBy: [{ encontro: { data: 'asc' } }],
  })
  const contagem = new Map<string, ContagemDoDbv>()
  for (const linha of linhas) {
    const atual = contagem.get(linha.dbvId) ?? { encontros: 0, presencas: 0, participacoes: 0, grupoId: linha.grupoId, grupoNome: linha.grupo.nome }
    atual.encontros += 1
    if (linha.presente) atual.presencas += 1
    if (linha.participou) atual.participacoes += 1
    // Em ordem de data: a última linha lida é a mais recente e dá o grupo.
    atual.grupoId = linha.grupoId
    atual.grupoNome = linha.grupo.nome
    contagem.set(linha.dbvId, atual)
  }
  return contagem
}

/** Edições terminadas cujo período cruza [inicio, fim], da mais recente para a mais antiga. */
export async function edicoesNoPeriodo(db: Banco, clubeId: string, inicio: string, fim: string): Promise<{ id: string; nome: string; inicio: string; fim: string }[]> {
  const edicoes = await db.edicaoClasseBiblica.findMany({
    where: { clubeId, terminadaEm: { not: null }, inicio: { lte: daDataCivil(fim) }, fim: { gte: daDataCivil(inicio) } },
    select: { id: true, nome: true, inicio: true, fim: true },
    orderBy: [{ inicio: 'desc' }, { id: 'desc' }],
  })
  return edicoes.flatMap((edicao) =>
    edicao.inicio && edicao.fim
      ? [{ id: edicao.id, nome: edicao.nome ?? '', inicio: paraDataCivil(edicao.inicio), fim: paraDataCivil(edicao.fim) }]
      : [],
  )
}

/** Encontros não cancelados com chamada registrada do grupo (painel). */
export function encontrosFeitos(db: Banco, clubeId: string, edicaoId: string, grupoId?: string): Promise<number> {
  return db.encontroClasseBiblica.count({
    where: { clubeId, edicaoId, canceladoEm: null, chamadas: { some: { clubeId, ...(grupoId ? { grupoId } : {}) } } },
  })
}
