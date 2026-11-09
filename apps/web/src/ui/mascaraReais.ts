const MAXIMO_DE_DIGITOS = 9

/**
 * Valor em reais digitado da direita para a esquerda, como em caixa eletrônico: "2", "25", "2500" viram
 * "0,02", "0,25", "25,00". Letras somem; vazio continua vazio, para o campo opcional não ganhar "0,00".
 */
export function mascararReais(texto: string): string {
  const digitos = texto.replace(/\D/g, '')
  if (digitos === '') return ''
  const centavos = Number(digitos.replace(/^0+/, '').slice(0, MAXIMO_DE_DIGITOS) || '0')
  return (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
