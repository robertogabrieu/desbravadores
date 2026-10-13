import { describe, expect, it } from 'vitest'
import { periodoDoEvento } from './periodo'

describe('periodoDoEvento', () => {
  it('dia único traz o dia da semana', () => {
    expect(periodoDoEvento('2026-04-04', '2026-04-04')).toBe('sábado, 04/04/2026')
  })

  it('vários dias no mesmo mês juntam os dias e dizem o mês uma vez', () => {
    expect(periodoDoEvento('2026-08-21', '2026-08-23')).toBe('21 a 23/08/2026')
  })

  it('meses diferentes repetem o mês do início', () => {
    expect(periodoDoEvento('2026-08-30', '2026-09-02')).toBe('30/08 a 02/09/2026')
  })

  it('anos diferentes repetem o ano do início', () => {
    expect(periodoDoEvento('2026-12-30', '2027-01-02')).toBe('30/12/2026 a 02/01/2027')
  })
})
