import { describe, expect, it } from 'vitest'
import { frequencia } from './frequencia'

describe('frequencia', () => {
  it('presente e atrasado contam; falta e justificada não', () => {
    expect(frequencia(['PRESENTE', 'ATRASADO', 'FALTA', 'FALTA_JUSTIFICADA'])).toBe(50)
  })
  it('lista vazia vale null', () => {
    expect(frequencia([])).toBeNull()
  })
  it('só presenças vale 100', () => {
    expect(frequencia(['PRESENTE'])).toBe(100)
  })
})
