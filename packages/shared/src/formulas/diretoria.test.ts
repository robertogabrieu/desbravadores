import { describe, expect, it } from 'vitest'
import { hojeNoFuso } from '../datas'
import { diretoriaPelaIdade, nascimentoLimiteDaDiretoria } from './diretoria'

describe('diretoriaPelaIdade', () => {
  it('quem faz 16 em 30/06 conta', () => {
    expect(diretoriaPelaIdade('2010-06-30', '2026-09-30')).toBe(true)
  })
  it('quem faz 16 em 01/07 não conta naquele ano', () => {
    expect(diretoriaPelaIdade('2010-07-01', '2026-09-30')).toBe(false)
  })
  it('quem faz 16 em março conta desde janeiro, antes do aniversário', () => {
    expect(diretoriaPelaIdade('2010-03-20', '2026-01-02')).toBe(true)
  })
  it('quem faz 16 em agosto não conta nem depois do aniversário', () => {
    expect(diretoriaPelaIdade('2010-08-10', '2026-12-31')).toBe(false)
  })
  it('17 ou mais conta', () => {
    expect(diretoriaPelaIdade('2009-12-31', '2026-01-01')).toBe(true)
    expect(diretoriaPelaIdade('1990-05-05', '2026-05-05')).toBe(true)
  })
  it('15 em 30/06 não conta', () => {
    expect(diretoriaPelaIdade('2011-06-30', '2026-06-30')).toBe(false)
  })
  it('na virada do ano, quem faz 16 em agosto passa a contar em 1º de janeiro', () => {
    expect(diretoriaPelaIdade('2010-08-10', '2026-12-31')).toBe(false)
    expect(diretoriaPelaIdade('2010-08-10', '2027-01-01')).toBe(true)
  })
  it('o ano é o do fuso do clube: 01/01 01h UTC ainda é 31/12 em São Paulo', () => {
    const agora = new Date('2027-01-01T01:00:00Z')
    expect(diretoriaPelaIdade('2010-08-10', hojeNoFuso('America/Sao_Paulo', agora))).toBe(false)
    expect(diretoriaPelaIdade('2010-08-10', hojeNoFuso('UTC', agora))).toBe(true)
  })
})

describe('nascimentoLimiteDaDiretoria', () => {
  it('é 30/06 de (ano de hoje − 16)', () => {
    expect(nascimentoLimiteDaDiretoria('2026-01-01')).toBe('2010-06-30')
    expect(nascimentoLimiteDaDiretoria('2026-12-31')).toBe('2010-06-30')
  })
})
