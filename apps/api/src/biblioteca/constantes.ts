import type { Prisma } from '../generated/prisma/client.js'

/** As prateleiras com que todo clube começa, na ordem da estante. */
export const CATEGORIAS_INICIAIS = ['Cadernos de Classes', 'Livros', 'Manuais & Documentos'] as const

/** Serializa as escritas da biblioteca do clube (SPEC, regra 9); só vale dentro de uma transação. */
export async function travarBiblioteca(tx: Prisma.TransactionClient, clubeId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`biblioteca:${clubeId}`}, 0))`
}
