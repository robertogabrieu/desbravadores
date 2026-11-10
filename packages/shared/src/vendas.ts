/** Dinheiro da venda é sempre em centavos inteiros. */
export const PRECO_MINIMO_CENTAVOS = 1
export const PRECO_MAXIMO_CENTAVOS = 999_999
export const TAXA_MAXIMA_CENTAVOS = 99_999
export const QUANTIDADE_MAXIMA_POR_ITEM = 999
export const PEDIDOS_POR_PAGINA = 20

export const TIPOS_DE_FORMA_DA_VENDA = ['PIX', 'SETE_ME', 'DINHEIRO'] as const
export type TipoDeFormaDaVenda = (typeof TIPOS_DE_FORMA_DA_VENDA)[number]

/** MISTO só existe no pedido: o comprador combina as formas que a venda aceita. */
export const FORMAS_DO_PEDIDO = [...TIPOS_DE_FORMA_DA_VENDA, 'MISTO'] as const
export type FormaDoPedido = (typeof FORMAS_DO_PEDIDO)[number]

const ROTULOS_DA_FORMA: Record<FormaDoPedido, string> = {
  PIX: 'Pix',
  SETE_ME: '7me',
  DINHEIRO: 'Dinheiro',
  MISTO: 'Misto',
}

export function rotuloDaForma(forma: FormaDoPedido): string {
  return ROTULOS_DA_FORMA[forma]
}

/** Cabe no limite padrão do nginx (3 MB) com o multipart; a foto é reduzida no aparelho para caber. */
export const LIMITE_BYTES_COMPROVANTE = 2.5 * 1024 * 1024
export const MENSAGEM_COMPROVANTE_GRANDE = 'O comprovante passa de 2,5 MB. Tire um print menor ou envie o PDF do banco.'

export const FILTROS_DO_PEDIDO = ['TODOS', 'A_PAGAR', 'A_ENTREGAR', 'ENTREGUES', 'CANCELADOS'] as const
export type FiltroDoPedido = (typeof FILTROS_DO_PEDIDO)[number]

const ROTULOS_DO_FILTRO: Record<FiltroDoPedido, string> = {
  TODOS: 'Todos',
  A_PAGAR: 'A pagar',
  A_ENTREGAR: 'A entregar',
  ENTREGUES: 'Entregues',
  CANCELADOS: 'Cancelados',
}

export function rotuloDoFiltro(filtro: FiltroDoPedido): string {
  return ROTULOS_DO_FILTRO[filtro]
}

export interface ItemParaTotal {
  quantidade: number
  precoGravado: number
}

/**
 * Total do pedido em centavos: soma(quantidade × preço gravado) + taxa gravada (0 se retirada).
 * Tela, imagem e painel usam só esta função.
 */
export function totalDoPedido(itens: readonly ItemParaTotal[], taxaGravada: number): number {
  return itens.reduce((soma, item) => soma + item.quantidade * item.precoGravado, 0) + taxaGravada
}

export const SITUACOES_DO_PEDIDO = ['CANCELADO', 'PAGO', 'A_PAGAR'] as const
export type SituacaoDoPedido = (typeof SITUACOES_DO_PEDIDO)[number]

export function situacaoDoPedido(pedido: { pago: boolean; canceladoEm: string | Date | null }): SituacaoDoPedido {
  if (pedido.canceladoEm) return 'CANCELADO'
  return pedido.pago ? 'PAGO' : 'A_PAGAR'
}

/** "Pago · Pix" quando a forma é conhecida; só "Pago" caso contrário. */
export function rotuloDaSituacao(situacao: SituacaoDoPedido, forma: FormaDoPedido | null = null): string {
  if (situacao === 'CANCELADO') return 'Cancelado'
  if (situacao === 'A_PAGAR') return 'A pagar'
  return forma ? `Pago · ${rotuloDaForma(forma)}` : 'Pago'
}
