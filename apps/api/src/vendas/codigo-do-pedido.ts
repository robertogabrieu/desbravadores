import { randomInt } from 'node:crypto'
import type { PrismaService } from '../comum/prisma/prisma.service'

/** Sem I, O, 0 e 1: o comprador lê o código em voz alta ou na imagem sem confundir os caracteres. */
export const ALFABETO_DO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const TAMANHO_DO_CODIGO = 6
export const TENTATIVAS_DO_CODIGO = 10

export function sortearCodigoDoPedido(): string {
  return Array.from({ length: TAMANHO_DO_CODIGO }, () => ALFABETO_DO_CODIGO[randomInt(ALFABETO_DO_CODIGO.length)]).join('')
}

type BancoDePedidos = Pick<PrismaService, 'pedidoVenda'>

/** Sorteia até achar um código que a venda ainda não usa; roda dentro da trava da venda, então ninguém ocupa o código no meio. */
export async function codigoLivreDoPedido(
  banco: BancoDePedidos,
  clubeId: string,
  vendaId: string,
  sortear: () => string = sortearCodigoDoPedido,
): Promise<string> {
  for (let tentativa = 0; tentativa < TENTATIVAS_DO_CODIGO; tentativa++) {
    const codigo = sortear()
    const usado = await banco.pedidoVenda.findFirst({ where: { clubeId, vendaId, codigo }, select: { id: true } })
    if (!usado) return codigo
  }
  throw new Error('Não foi possível sortear um código livre para o pedido.')
}
