import type { Classe, Prisma } from '../generated/prisma/client.js'

type Cliente = Pick<Prisma.TransactionClient, 'classe'>

/** Classe desligada pelo clube (`ClasseClube.ativa = false`) não existe para matrícula nova. */
export const ativaNoClube = (clubeId: string) => ({ clubes: { none: { clubeId, ativa: false } } }) satisfies Prisma.ClasseWhereInput

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
    ...ativaNoClube(clubeId),
    classeBase: { is: { ativa: true, ...ativaNoClube(clubeId) } },
  }
}

/** A avancada que anda com cada uma das regulares recebidas (so as de par ativo). */
export function avancadaDoPar(clubeId: string, regularIds: string[]): Prisma.ClasseWhereInput {
  return { ...avancadaComParAtivo(clubeId), classeBaseId: { in: regularIds } }
}

/**
 * A avançada que anda com cada regular recebida (só as de par ativo). Havendo mais de uma avançada ativa para a
 * mesma regular, vale sempre a de menor `ordem` (a mesma que a matrícula escolhe).
 */
export async function avancadasPareadas(db: Cliente, clubeId: string, regularIds: string[]): Promise<Map<string, Classe>> {
  const pareadas = new Map<string, Classe>()
  if (regularIds.length === 0) return pareadas
  const avancadas = await db.classe.findMany({ where: avancadaDoPar(clubeId, regularIds), orderBy: [{ ordem: 'asc' }, { id: 'asc' }] })
  for (const avancada of avancadas) {
    if (avancada.classeBaseId && !pareadas.has(avancada.classeBaseId)) pareadas.set(avancada.classeBaseId, avancada)
  }
  return pareadas
}

/** A avançada pareada desta regular, ou `null` quando o par não está ativo. */
export async function avancadaPareadaDe(db: Cliente, clubeId: string, regularId: string): Promise<Classe | null> {
  return (await avancadasPareadas(db, clubeId, [regularId])).get(regularId) ?? null
}

/** A regular desta avançada, quando ela é a avançada pareada de um par ativo; `null` fora disso. */
export async function regularDoPar(db: Cliente, clubeId: string, avancadaId: string): Promise<string | null> {
  const avancada = await db.classe.findFirst({ where: { ...avancadaComParAtivo(clubeId), id: avancadaId }, select: { classeBaseId: true } })
  if (!avancada?.classeBaseId) return null
  return (await avancadaPareadaDe(db, clubeId, avancada.classeBaseId))?.id === avancadaId ? avancada.classeBaseId : null
}

/** A avançada com o par ativo: ela e a regular ativas no sistema e no clube, e ela é a pareada da regular. */
export async function temParAtivo(db: Cliente, clubeId: string, avancadaId: string): Promise<boolean> {
  return (await regularDoPar(db, clubeId, avancadaId)) !== null
}

/** A lista recebida mais a avancada pareada de cada regular dela. */
export async function comAvancadasPareadas(db: Cliente, clubeId: string, classeIds: string[]): Promise<string[]> {
  const recebidas = [...new Set(classeIds)]
  const pareadas = await avancadasPareadas(db, clubeId, recebidas)
  return [...new Set([...recebidas, ...[...pareadas.values()].map((avancada) => avancada.id)])]
}

/**
 * A regular e a avancada dela andam juntas: devolve a lista com a regular de cada avancada recebida
 * e a avancada de cada regular, quando o par esta ativo. Classe sem par (agrupadas, regular sem avancada
 * ou par desativado no sistema ou no clube) fica como veio.
 */
export async function comParDeClasses(db: Cliente, clubeId: string, classeIds: string[]): Promise<string[]> {
  const recebidas = [...new Set(classeIds)]
  if (recebidas.length === 0) return recebidas
  const candidatas = await db.classe.findMany({
    where: { ...avancadaComParAtivo(clubeId), id: { in: recebidas } },
    select: { id: true, classeBaseId: true },
  })
  const pareadas = await avancadasPareadas(db, clubeId, candidatas.flatMap((avancada) => (avancada.classeBaseId ? [avancada.classeBaseId] : [])))
  const regulares = candidatas.flatMap((avancada) =>
    avancada.classeBaseId && pareadas.get(avancada.classeBaseId)?.id === avancada.id ? [avancada.classeBaseId] : [],
  )
  return comAvancadasPareadas(db, clubeId, [...recebidas, ...regulares])
}
