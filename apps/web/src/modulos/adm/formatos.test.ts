import { describe, expect, it } from 'vitest'
import { dataCivilBr, dataPorExtenso, horaCurta, instanteCurto, juntarNomes, periodoPorExtenso, textoDoUltimoAcesso } from './formatos'

const FUSO = 'America/Sao_Paulo'

describe('formatos das fichas', () => {
  it('datas', () => {
    expect(dataCivilBr('2016-01-15')).toBe('15/01/2016')
    expect(dataPorExtenso('2026-09-27')).toBe('Domingo, 27 de setembro')
    expect(periodoPorExtenso('2026-10-16', '2026-10-18')).toBe('sex 16 a dom 18 de outubro')
    expect(periodoPorExtenso('2026-10-17', '2026-10-17')).toBe('sáb 17 de outubro')
    expect(periodoPorExtenso('2026-10-30', '2026-11-01')).toBe('sex 30 de outubro a dom 1 de novembro')
  })

  it('horas e instantes', () => {
    expect(horaCurta('09:00')).toBe('9h')
    expect(horaCurta('19:30')).toBe('19h30')
    expect(instanteCurto('2026-09-27T14:02:00.000Z', FUSO)).toBe('27/09 às 11:02')
  })

  it('nomes', () => {
    expect(juntarNomes(['Amigo'])).toBe('Amigo')
    expect(juntarNomes(['Amigo', 'Companheiro'])).toBe('Amigo e Companheiro')
    expect(juntarNomes(['A', 'B', 'C'])).toBe('A, B e C')
  })

  it('último acesso: nunca, hoje, ontem e data', () => {
    const agora = new Date('2026-09-30T15:00:00.000Z')
    expect(textoDoUltimoAcesso(null, agora, FUSO)).toBe('nunca acessou')
    expect(textoDoUltimoAcesso('2026-09-30T11:00:00.000Z', agora, FUSO)).toBe('último acesso hoje')
    expect(textoDoUltimoAcesso('2026-09-29T20:00:00.000Z', agora, FUSO)).toBe('último acesso ontem')
    expect(textoDoUltimoAcesso('2026-09-12T20:00:00.000Z', agora, FUSO)).toBe('último acesso em 12/09/2026')
  })
})
