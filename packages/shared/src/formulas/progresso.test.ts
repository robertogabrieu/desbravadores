import { describe, expect, it } from 'vitest'
import { mediaTurma, percentualClasse, prontoParaInvestidura } from './progresso'

describe('percentualClasse', () => {
  it('não arredonda', () => {
    expect(percentualClasse(1, 3)).toBeCloseTo(33.3333, 3)
    expect(percentualClasse(5, 10)).toBe(50)
  })
  it('total 0 vale 0', () => {
    expect(percentualClasse(0, 0)).toBe(0)
  })
})

describe('mediaTurma', () => {
  it('arredonda só no fim', () => {
    expect(mediaTurma([33.33, 66.67, 100])).toBe(67)
  })
  it('lista vazia vale 0', () => {
    expect(mediaTurma([])).toBe(0)
  })
})

describe('prontoParaInvestidura', () => {
  it('só com 100 exato', () => {
    expect(prontoParaInvestidura(100)).toBe(true)
    expect(prontoParaInvestidura(99.99)).toBe(false)
  })
})
