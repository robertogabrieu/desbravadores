import { describe, expect, it } from 'vitest'
import { anoClube, hojeNoFuso, idade } from './datas'

describe('anoClube', () => {
  it('antes do início pertence ao ano anterior', () => {
    expect(anoClube('2027-01-15', '02-01')).toBe(2026)
  })
  it('no dia do início já é o ano novo', () => {
    expect(anoClube('2027-02-01', '02-01')).toBe(2027)
  })
})

describe('idade', () => {
  it('aniversário hoje conta', () => {
    expect(idade('2010-05-10', '2024-05-10')).toBe(14)
  })
  it('véspera do aniversário ainda não', () => {
    expect(idade('2010-05-10', '2024-05-09')).toBe(13)
  })
  it('29/02 em ano não bissexto faz aniversário em 01/03', () => {
    expect(idade('2012-02-29', '2027-02-28')).toBe(14)
    expect(idade('2012-02-29', '2027-03-01')).toBe(15)
  })
  it('29/02 em ano bissexto faz aniversário em 29/02', () => {
    expect(idade('2012-02-29', '2028-02-29')).toBe(16)
  })
})

describe('hojeNoFuso', () => {
  it('28/09 02:30Z em São Paulo ainda é 27/09', () => {
    expect(hojeNoFuso('America/Sao_Paulo', new Date('2026-09-28T02:30:00Z'))).toBe('2026-09-27')
  })
  it('no mesmo instante, UTC já é 28/09', () => {
    expect(hojeNoFuso('UTC', new Date('2026-09-28T02:30:00Z'))).toBe('2026-09-28')
  })
})
