import { describe, expect, it } from 'vitest'
import { hojeNoFuso } from '../datas'
import {
  diretoriaPelaIdade,
  motivosDiretoria,
  nascimentoLimiteDaDiretoria,
  recusaDeVoltarADesbravador,
  tipoDaFicha,
  type FichaDoTipo,
} from './diretoria'

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

describe('tipoDaFicha: o Tipo que a regra da Diretoria pede', () => {
  const HOJE = '2026-09-30'
  const crianca = '2014-05-10'
  const dezesseis = '2010-03-20'
  const ficha = (sobrescrever: Partial<FichaDoTipo> = {}): FichaDoTipo => ({
    tipo: 'DBV',
    diretoriaPeloAdm: false,
    diretoriaDesde: null,
    nascimento: crianca,
    papeis: [],
    ...sobrescrever,
  })

  it('DBV com 16 até junho vira Diretoria, desde hoje', () => {
    expect(tipoDaFicha(ficha({ nascimento: dezesseis }), HOJE)).toEqual({
      tipo: 'DIRETORIA',
      diretoriaPeloAdm: false,
      diretoriaDesde: HOJE,
    })
  })
  it('DBV conselheiro ou instrutor vira Diretoria; ADM não conta', () => {
    expect(tipoDaFicha(ficha({ papeis: ['CONSELHEIRO'] }), HOJE).tipo).toBe('DIRETORIA')
    expect(tipoDaFicha(ficha({ papeis: ['INSTRUTOR'] }), HOJE).tipo).toBe('DIRETORIA')
    expect(tipoDaFicha(ficha({ papeis: ['ADM'] }), HOJE).tipo).toBe('DBV')
  })
  it('DBV sem a regra continua DBV', () => {
    expect(tipoDaFicha(ficha(), HOJE)).toEqual({ tipo: 'DBV', diretoriaPeloAdm: false, diretoriaDesde: null })
  })
  it('Líder nunca muda sozinho, nem com a regra valendo', () => {
    const lider = ficha({ tipo: 'LIDER', nascimento: dezesseis, papeis: ['CONSELHEIRO'] })
    expect(tipoDaFicha(lider, HOJE)).toEqual({ tipo: 'LIDER', diretoriaPeloAdm: false, diretoriaDesde: null })
  })
  it('menor de 16 que perdeu o papel volta a DBV e perde a data', () => {
    const diretoria = ficha({ tipo: 'DIRETORIA', diretoriaDesde: '2026-02-01' })
    expect(tipoDaFicha(diretoria, HOJE)).toEqual({ tipo: 'DBV', diretoriaPeloAdm: false, diretoriaDesde: null })
  })
  it('marcada pelo Adm não volta sozinha, mesmo sem a regra', () => {
    const peloAdm = ficha({ tipo: 'DIRETORIA', diretoriaPeloAdm: true, diretoriaDesde: '2026-02-01' })
    expect(tipoDaFicha(peloAdm, HOJE)).toEqual({ tipo: 'DIRETORIA', diretoriaPeloAdm: true, diretoriaDesde: '2026-02-01' })
  })
  it('pela idade é irreversível: no ano seguinte continua Diretoria, com a data de entrada', () => {
    const entrou = tipoDaFicha(ficha({ nascimento: dezesseis }), '2026-01-01')
    expect(tipoDaFicha({ ...ficha({ nascimento: dezesseis }), ...entrou }, '2027-06-01')).toEqual(entrou)
  })
  it('Diretoria sem data ganha a de hoje; com data, mantém', () => {
    expect(tipoDaFicha(ficha({ tipo: 'DIRETORIA', nascimento: dezesseis }), HOJE).diretoriaDesde).toBe(HOJE)
    const instrutor = ficha({ tipo: 'DIRETORIA', papeis: ['INSTRUTOR'], diretoriaDesde: '2026-03-01' })
    expect(tipoDaFicha(instrutor, HOJE).diretoriaDesde).toBe('2026-03-01')
  })
  it('virada do ano: quem faz 16 em agosto entra em 1º de janeiro', () => {
    const agosto = ficha({ nascimento: '2010-08-10' })
    expect(tipoDaFicha(agosto, '2026-12-31').tipo).toBe('DBV')
    expect(tipoDaFicha(agosto, '2027-01-01')).toEqual({ tipo: 'DIRETORIA', diretoriaPeloAdm: false, diretoriaDesde: '2027-01-01' })
  })
})

describe('motivosDiretoria', () => {
  const base: FichaDoTipo = {
    tipo: 'DIRETORIA',
    diretoriaPeloAdm: false,
    diretoriaDesde: '2026-01-01',
    nascimento: '2010-03-20',
    papeis: [],
  }
  it('somam idade, papéis e Adm, nessa ordem', () => {
    const tudo = { ...base, papeis: ['INSTRUTOR', 'CONSELHEIRO', 'ADM'] as const, diretoriaPeloAdm: true }
    expect(motivosDiretoria(tudo, '2026-09-30')).toEqual(['IDADE', 'CONSELHEIRO', 'INSTRUTOR', 'ADM'])
  })
  it('vazios fora da Diretoria, inclusive para o Líder conselheiro', () => {
    expect(motivosDiretoria({ ...base, tipo: 'LIDER', papeis: ['CONSELHEIRO'] }, '2026-09-30')).toEqual([])
    expect(motivosDiretoria({ ...base, tipo: 'DBV' }, '2026-09-30')).toEqual([])
  })
})

describe('recusaDeVoltarADesbravador', () => {
  it('diz o motivo da regra, a idade primeiro', () => {
    expect(recusaDeVoltarADesbravador('2010-03-20', ['CONSELHEIRO'], '2026-09-30')).toBe(
      'Tem 16 anos até junho: é Diretoria automaticamente.',
    )
    expect(recusaDeVoltarADesbravador('2014-05-10', ['INSTRUTOR'], '2026-09-30')).toBe(
      'É conselheiro ou instrutor: é Diretoria obrigatoriamente.',
    )
  })
  it('sem a regra, não recusa', () => {
    expect(recusaDeVoltarADesbravador('2014-05-10', ['ADM'], '2026-09-30')).toBeNull()
  })
})
