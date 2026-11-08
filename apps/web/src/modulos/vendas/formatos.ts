import type { VendaSaida } from '@desbravadores/shared'

const SEPARADOR = ' · '

/** "R$ 3.930" quando não há centavos, "R$ 3.930,50" quando há. */
export function formatarReais(centavos: number): string {
  const inteiro = centavos % 100 === 0
  const valor = (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: inteiro ? 0 : 2, maximumFractionDigits: 2 })
  return `R$ ${valor}`
}

/** "25,00": o valor como se digita no campo de preço. */
export const centavosParaTexto = (centavos: number): string => (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })

const COM_VIRGULA = /^\d+(,\d{1,2})?$/
const COM_PONTO = /^\d+\.\d{1,2}$/
const COM_MILHAR = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/

/** Reais digitados em centavos: vazio vale 0 e o que não é dinheiro volta `null`. Aceita "25", "25,5", "1.250,00" e "25.50". */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.trim()
  if (limpo === '') return 0
  const normalizado = COM_MILHAR.test(limpo) ? limpo.replaceAll('.', '') : limpo
  if (!COM_VIRGULA.test(normalizado) && !COM_PONTO.test(normalizado)) return null
  return Math.round(Number(normalizado.replace(',', '.')) * 100)
}

const maiuscula = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1)

/** "Sábado, 14/11": a data de calendário da retirada, sem fuso. */
export function dataDaRetirada(iso: string): string {
  const [, mes = '', dia = ''] = iso.split('-')
  const diaDaSemana = new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' })
  return `${maiuscula(diaDaSemana)}, ${dia}/${mes}`
}

/** "Sábado, 14/11 · 9h às 12h · Salão da igreja": só o que a venda informou; vazio quando não informou nada. */
export function descricaoDaRetirada(venda: Pick<VendaSaida, 'retiradaData' | 'retiradaHorario' | 'retiradaLocal'>): string {
  return [venda.retiradaData ? dataDaRetirada(venda.retiradaData) : null, venda.retiradaHorario, venda.retiradaLocal].filter(Boolean).join(SEPARADOR)
}
