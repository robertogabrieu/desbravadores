import { describe, expect, it } from 'vitest'
import { nomePublico } from './nome-publico'

describe('nomePublico', () => {
  it('primeiro nome mais inicial do último sobrenome', () => {
    expect(nomePublico('Ana Clara Souza')).toBe('Ana S.')
  })
  it('ignora partículas', () => {
    expect(nomePublico('João da Silva')).toBe('João S.')
    expect(nomePublico('Maria Souza e Silva')).toBe('Maria S.')
    expect(nomePublico('Maria Silva de')).toBe('Maria S.')
  })
  it('nome único fica sozinho', () => {
    expect(nomePublico('Pedro')).toBe('Pedro')
    expect(nomePublico('  Pedro  ')).toBe('Pedro')
  })
  it('espaços extras não atrapalham', () => {
    expect(nomePublico('  Ana   Souza ')).toBe('Ana S.')
  })
})
