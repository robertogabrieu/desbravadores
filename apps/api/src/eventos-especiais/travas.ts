import type { Prisma } from '../generated/prisma/client.js'

/**
 * Trava do evento (a segunda na ordem: clube, evento, critérios): serializa marcas, conclusão e regravação
 * dos pontos do mesmo evento. Vale até o fim da transação e pode ser pedida de novo na mesma transação.
 */
export async function travarPresencaDoEvento(tx: Prisma.TransactionClient, eventoId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('presenca-especial'), hashtext(${eventoId}))`
}
