import type { Prisma } from '../generated/prisma/client.js'

type Cliente = Prisma.TransactionClient

/**
 * A regular e a avancada dela andam juntas: devolve a lista com a regular de cada avancada recebida
 * e a avancada (ativa) de cada regular. Classe sem par (agrupadas, ou regular sem avancada) fica como veio.
 */
export async function comParDeClasses(tx: Cliente, clubeId: string, classeIds: string[]): Promise<string[]> {
  const recebidas = [...new Set(classeIds)]
  if (recebidas.length === 0) return recebidas
  const doClube = [{ clubeId: null }, { clubeId }]
  const lidas = await tx.classe.findMany({
    where: { id: { in: recebidas }, trilha: 'INDIVIDUAL', OR: doClube },
    select: { tipo: true, classeBaseId: true },
  })
  const resultado = new Set(recebidas)
  for (const classe of lidas) {
    if (classe.tipo === 'AVANCADA' && classe.classeBaseId) resultado.add(classe.classeBaseId)
  }
  const avancadas = await tx.classe.findMany({
    where: { tipo: 'AVANCADA', trilha: 'INDIVIDUAL', ativa: true, classeBaseId: { in: [...resultado] }, OR: doClube },
    select: { id: true },
  })
  for (const avancada of avancadas) resultado.add(avancada.id)
  return [...resultado]
}
