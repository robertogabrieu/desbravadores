import { describe, expect, it } from 'vitest'
import {
  FILTROS_DO_PEDIDO,
  PEDIDOS_POR_PAGINA,
  PRECO_MAXIMO_CENTAVOS,
  QUANTIDADE_MAXIMA_POR_ITEM,
  TAXA_MAXIMA_CENTAVOS,
  rotuloDaForma,
  rotuloDaSituacao,
  rotuloDoFiltro,
  situacaoDoPedido,
  totalDoPedido,
} from './vendas'

describe('totalDoPedido', () => {
  it('soma quantidade × preço gravado de cada item mais a taxa', () => {
    const itens = [
      { quantidade: 2, precoGravado: 2500 },
      { quantidade: 1, precoGravado: 3000 },
    ]
    expect(totalDoPedido(itens, 500)).toBe(8500)
  })
  it('retirada tem taxa 0: o total é só dos itens', () => {
    expect(totalDoPedido([{ quantidade: 3, precoGravado: 1000 }], 0)).toBe(3000)
  })
  it('usa o preço gravado do item, não o preço atual do produto', () => {
    expect(totalDoPedido([{ quantidade: 2, precoGravado: 2000 }], 0)).toBe(4000)
  })
  it('item com quantidade zero não soma', () => {
    expect(totalDoPedido([{ quantidade: 0, precoGravado: 999_999 }, { quantidade: 1, precoGravado: 100 }], 0)).toBe(100)
  })
  it('no limite máximo (999 × 999.999 + taxa) ainda é inteiro exato', () => {
    const total = totalDoPedido([{ quantidade: QUANTIDADE_MAXIMA_POR_ITEM, precoGravado: PRECO_MAXIMO_CENTAVOS }], TAXA_MAXIMA_CENTAVOS)
    expect(total).toBe(999 * 999_999 + 99_999)
    expect(Number.isSafeInteger(total)).toBe(true)
  })
})

describe('situação e rótulos', () => {
  it('cancelado vence o pago', () => {
    expect(situacaoDoPedido({ pago: true, canceladoEm: '2026-11-01T10:00:00Z' })).toBe('CANCELADO')
  })
  it('pago e a pagar', () => {
    expect(situacaoDoPedido({ pago: true, canceladoEm: null })).toBe('PAGO')
    expect(situacaoDoPedido({ pago: false, canceladoEm: null })).toBe('A_PAGAR')
  })
  it('rótulos da situação', () => {
    expect(rotuloDaSituacao('CANCELADO')).toBe('Cancelado')
    expect(rotuloDaSituacao('A_PAGAR')).toBe('A pagar')
    expect(rotuloDaSituacao('PAGO')).toBe('Pago')
    expect(rotuloDaSituacao('PAGO', 'SETE_ME')).toBe('Pago · 7me')
  })
  it('rótulo da forma', () => {
    expect(rotuloDaForma('PIX')).toBe('Pix')
    expect(rotuloDaForma('MISTO')).toBe('Misto')
  })
})

describe('filtros do painel', () => {
  it('são quatro, na ordem da tela, cada um com rótulo', () => {
    expect(FILTROS_DO_PEDIDO).toEqual(['TODOS', 'A_PAGAR', 'A_ENTREGAR', 'ENTREGUES', 'CANCELADOS'])
    expect(FILTROS_DO_PEDIDO.map(rotuloDoFiltro)).toEqual(['Todos', 'A pagar', 'A entregar', 'Entregues', 'Cancelados'])
  })
  it('a página tem 20 pedidos', () => {
    expect(PEDIDOS_POR_PAGINA).toBe(20)
  })
})
