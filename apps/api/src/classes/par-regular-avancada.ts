import type { Prisma } from '../generated/prisma/client.js'

type Cliente = Pick<Prisma.TransactionClient, 'classe'>

const naoDesativadaNoClube = (clubeId: string): Prisma.ClasseWhereInput => ({ NOT: { clubes: { some: { clubeId, ativa: false } } } })

/**
 * Avancada (individual) cujo par esta ativo: ela e a regular dela ativas no sistema (`Classe.ativa`) e no clube
 * (`ClasseClube.ativa`, ou o padrao quando nao ha linha). Fora disso, a classe fica sozinha.
 */
export function avancadaComParAtivo(clubeId: string): Prisma.ClasseWhereInput {
  return {
    tipo: 'AVANCADA',
    trilha: 'INDIVIDUAL',
    ativa: true,
    classeBaseId: { not: null },
    OR: [{ clubeId: null }, { clubeId }],
    ...naoDesativadaNoClube(clubeId),
    classeBase: { is: { ativa: true, ...naoDesativadaNoClube(clubeId) } },
  }
}

/** A avancada que anda com cada uma das regulares recebidas (so as de par ativo). */
export function avancadaDoPar(clubeId: string, regularIds: string[]): Prisma.ClasseWhereInput {
  return { ...avancadaComParAtivo(clubeId), classeBaseId: { in: regularIds } }
}

/** A lista recebida mais a avancada pareada de cada regular dela. */
export async function comAvancadasPareadas(db: Cliente, clubeId: string, classeIds: string[]): Promise<string[]> {
  const recebidas = [...new Set(classeIds)]
  if (recebidas.length === 0) return recebidas
  const avancadas = await db.classe.findMany({ where: avancadaDoPar(clubeId, recebidas), select: { id: true } })
  return [...new Set([...recebidas, ...avancadas.map((avancada) => avancada.id)])]
}

/**
 * A regular e a avancada dela andam juntas: devolve a lista com a regular de cada avancada recebida
 * e a avancada de cada regular, quando o par esta ativo. Classe sem par (agrupadas, regular sem avancada
 * ou par desativado no sistema ou no clube) fica como veio.
 */
export async function comParDeClasses(db: Cliente, clubeId: string, classeIds: string[]): Promise<string[]> {
  const recebidas = [...new Set(classeIds)]
  if (recebidas.length === 0) return recebidas
  const avancadas = await db.classe.findMany({
    where: { ...avancadaComParAtivo(clubeId), id: { in: recebidas } },
    select: { classeBaseId: true },
  })
  const regulares = avancadas.flatMap((avancada) => (avancada.classeBaseId ? [avancada.classeBaseId] : []))
  return comAvancadasPareadas(db, clubeId, [...recebidas, ...regulares])
}
