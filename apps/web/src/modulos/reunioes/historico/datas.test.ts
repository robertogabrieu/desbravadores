import { describe, expect, it } from 'vitest'
import { nomeDoMes } from './datas'

describe('nomeDoMes', () => {
  it('só a primeira letra do mês é maiúscula', () => {
    expect(nomeDoMes('2026-09')).toBe('Setembro de 2026')
    expect(nomeDoMes('2026-03')).toBe('Março de 2026')
  })
})
