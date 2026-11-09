import type { Prisma } from '../generated/prisma/client.js'
import { ErroApp } from '../comum/erros'

export const VENDA_NAO_ENCONTRADA = 'Venda não encontrada.'
export const VENDA_ENCERRADA = 'Esta venda foi encerrada. Reabra para alterar.'

/** Serializa toda escrita de uma venda (SPEC, D15); só vale dentro de uma transação. */
export async function travarVenda(tx: Prisma.TransactionClient, vendaId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`venda:${vendaId}`}, 0))`
}

/** Venda encerrada é só leitura: toda escrita, menos reabrir, passa por aqui. */
export function exigirVendaAberta(venda: { encerradaEm: Date | null }): void {
  if (venda.encerradaEm) throw new ErroApp('CONFLITO', VENDA_ENCERRADA)
}
