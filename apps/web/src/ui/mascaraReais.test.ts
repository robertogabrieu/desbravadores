import { describe, expect, it } from 'vitest'
import { mascararReais } from './mascaraReais'

describe('mascararReais', () => {
  it('preenche da direita para a esquerda, com vírgula dos centavos', () => {
    expect(mascararReais('2')).toBe('0,02')
    expect(mascararReais('25')).toBe('0,25')
    expect(mascararReais('2500')).toBe('25,00')
  })

  it('separa o milhar com ponto', () => {
    expect(mascararReais('125050')).toBe('1.250,50')
  })

  it('reformata o que já veio formatado, inclusive ao apagar um dígito', () => {
    expect(mascararReais('25,00')).toBe('25,00')
    expect(mascararReais('25,0')).toBe('2,50')
    expect(mascararReais('1.250,500')).toBe('12.505,00')
  })

  it('tira letras e símbolos e deixa vazio quando não sobra número', () => {
    expect(mascararReais('R$ 3,5x')).toBe('0,35')
    expect(mascararReais('abc')).toBe('')
    expect(mascararReais('')).toBe('')
  })

  it('zero digitado aparece como 0,00, e para no limite de dígitos', () => {
    expect(mascararReais('0')).toBe('0,00')
    expect(mascararReais('12345678901')).toBe('1.234.567,89')
  })
})
