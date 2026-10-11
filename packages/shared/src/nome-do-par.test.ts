import { describe, expect, it } from 'vitest'
import { nomeDoPar } from './nome-do-par'

describe('nomeDoPar', () => {
  it('junta regular e avançada, e sem avançada fica o nome da regular', () => {
    expect(nomeDoPar('Amigo', 'Amigo da Natureza')).toBe('Amigo + Amigo da Natureza')
    expect(nomeDoPar('Amigo', undefined)).toBe('Amigo')
    expect(nomeDoPar('Amigo', null)).toBe('Amigo')
  })
})
