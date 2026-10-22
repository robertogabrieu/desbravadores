import { describe, expect, it } from 'vitest'
import { PRAZO_DE_EMPRESTIMO_EM_DIAS, situacaoDoEmprestimo, somarDiasAData } from './datas'

describe('somarDiasAData', () => {
  it('o prazo é de 14 dias', () => {
    expect(PRAZO_DE_EMPRESTIMO_EM_DIAS).toBe(14)
  })
  it('vira o mês: 21/10 + 14 = 04/11', () => {
    expect(somarDiasAData('2026-10-21', 14)).toBe('2026-11-04')
  })
  it('vira o ano', () => {
    expect(somarDiasAData('2026-12-25', 14)).toBe('2027-01-08')
  })
  it('respeita fevereiro bissexto e não bissexto', () => {
    expect(somarDiasAData('2028-02-20', 14)).toBe('2028-03-05')
    expect(somarDiasAData('2027-02-20', 14)).toBe('2027-03-06')
  })
  it('aceita zero e negativo', () => {
    expect(somarDiasAData('2026-03-01', 0)).toBe('2026-03-01')
    expect(somarDiasAData('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('situacaoDoEmprestimo', () => {
  it('antes do prazo está no prazo, sem dias de atraso', () => {
    expect(situacaoDoEmprestimo('2026-11-04', '2026-10-21')).toEqual({ situacao: 'NO_PRAZO', dias: 0 })
  })
  it('no dia da devolução vence hoje', () => {
    expect(situacaoDoEmprestimo('2026-11-04', '2026-11-04')).toEqual({ situacao: 'VENCE_HOJE', dias: 0 })
  })
  it('um dia depois está atrasado há 1 dia', () => {
    expect(situacaoDoEmprestimo('2026-11-04', '2026-11-05')).toEqual({ situacao: 'ATRASADO', dias: 1 })
  })
  it('conta o atraso pela virada de mês e de ano', () => {
    expect(situacaoDoEmprestimo('2026-10-28', '2026-11-04')).toEqual({ situacao: 'ATRASADO', dias: 7 })
    expect(situacaoDoEmprestimo('2026-12-30', '2027-01-03')).toEqual({ situacao: 'ATRASADO', dias: 4 })
  })
})
