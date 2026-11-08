import { describe, expect, it } from 'vitest'
import { centavosParaTexto, descricaoDaRetirada, formatarReais, formatarReaisComCentavos, reaisParaCentavos, situacaoDaEntrega } from './formatos'

describe('formatos da venda', () => {
  it('formatarReaisComCentavos mostra sempre os centavos', () => {
    expect(formatarReaisComCentavos(7500)).toBe('R$ 75,00')
    expect(formatarReaisComCentavos(393_050)).toBe('R$ 3.930,50')
  })

  it('situacaoDaEntrega fala em retirada quando o pedido é de retirada', () => {
    expect(situacaoDaEntrega({ entrega: false, entregueEm: null })).toBe('A retirar')
    expect(situacaoDaEntrega({ entrega: false, entregueEm: '2026-11-14T13:00:00.000Z' })).toBe('Retirado')
    expect(situacaoDaEntrega({ entrega: true, entregueEm: null })).toBe('A entregar')
    expect(situacaoDaEntrega({ entrega: true, entregueEm: '2026-11-14T13:00:00.000Z' })).toBe('Entregue')
  })

  it('formatarReais tira os centavos quando são zero', () => {
    expect(formatarReais(393_000)).toBe('R$ 3.930')
    expect(formatarReais(2550)).toBe('R$ 25,50')
    expect(formatarReais(0)).toBe('R$ 0')
  })

  it('centavosParaTexto escreve como se digita', () => {
    expect(centavosParaTexto(2500)).toBe('25,00')
    expect(centavosParaTexto(125_000)).toBe('1250,00')
  })

  it.each([
    ['', 0],
    ['25', 2500],
    ['25,5', 2550],
    ['25,50', 2550],
    ['25.50', 2550],
    ['1.250,00', 125_000],
    ['0,01', 1],
  ])('reaisParaCentavos(%j) = %j', (texto, centavos) => {
    expect(reaisParaCentavos(texto)).toBe(centavos)
  })

  it.each(['abc', '25,555', '-5', '1,2,3', 'R$ 5'])('reaisParaCentavos(%j) recusa', (texto) => {
    expect(reaisParaCentavos(texto)).toBeNull()
  })

  it('descricaoDaRetirada junta só o que a venda informou', () => {
    expect(descricaoDaRetirada({ retiradaData: '2026-11-14', retiradaHorario: '9h às 12h', retiradaLocal: 'Salão da igreja' })).toBe('Sábado, 14/11 · 9h às 12h · Salão da igreja')
    expect(descricaoDaRetirada({ retiradaData: null, retiradaHorario: null, retiradaLocal: 'Salão' })).toBe('Salão')
    expect(descricaoDaRetirada({ retiradaData: null, retiradaHorario: null, retiradaLocal: null })).toBe('')
  })
})
