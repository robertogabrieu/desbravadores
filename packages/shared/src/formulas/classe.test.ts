import { describe, expect, it } from 'vitest'
import { DIA_DE_CORTE_DA_CLASSE, idadeDaClasse } from './classe'

describe('idadeDaClasse: a idade completada até 30/06 do ano do clube', () => {
  it('o corte é 30/06', () => {
    expect(DIA_DE_CORTE_DA_CLASSE).toBe('06-30')
  })

  it.each([
    ['2015-03-15', 11],
    ['2015-09-15', 10],
    ['2015-06-30', 11],
    ['2015-07-01', 10],
    ['2016-02-29', 10],
  ])('ano do clube 2026, nascido em %s → %i', (nascimento, esperada) => {
    expect(idadeDaClasse(nascimento, 2026)).toBe(esperada)
  })
})
