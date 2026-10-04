import { describe, expect, it } from 'vitest'
import { nomePublico, primeiroEUltimoNome } from './nome-publico'

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

describe('primeiroEUltimoNome', () => {
  it('primeiro e último sobrenome, sem os do meio', () => {
    expect(primeiroEUltimoNome('Ana Clara Souza')).toBe('Ana Souza')
  })
  it('sufixo de família acompanha o sobrenome que vem antes dele', () => {
    expect(primeiroEUltimoNome('Pedro Henrique Alves Filho')).toBe('Pedro Alves Filho')
    expect(primeiroEUltimoNome('Maria Clara Souza Filha')).toBe('Maria Souza Filha')
    expect(primeiroEUltimoNome('Carlos Eduardo Lima Junior')).toBe('Carlos Lima Junior')
    expect(primeiroEUltimoNome('Carlos Eduardo Lima Jr.')).toBe('Carlos Lima Jr.')
    expect(primeiroEUltimoNome('José Antônio Prado Neto')).toBe('José Prado Neto')
    expect(primeiroEUltimoNome('Ana Paula Prado Neta')).toBe('Ana Prado Neta')
    expect(primeiroEUltimoNome('Rui Carlos Mota Sobrinho')).toBe('Rui Mota Sobrinho')
    expect(primeiroEUltimoNome('Lia Maria Mota Sobrinha')).toBe('Lia Mota Sobrinha')
    expect(primeiroEUltimoNome('Luís Felipe Costa Segundo')).toBe('Luís Costa Segundo')
    expect(primeiroEUltimoNome('Luís Felipe Costa Terceiro')).toBe('Luís Costa Terceiro')
  })
  it('ignora partículas, também antes do sufixo', () => {
    expect(primeiroEUltimoNome('João da Silva Júnior')).toBe('João Silva Júnior')
    expect(primeiroEUltimoNome('Maria Souza e Silva')).toBe('Maria Silva')
    expect(primeiroEUltimoNome('João dos Santos')).toBe('João Santos')
  })
  it('sufixo em minúscula também conta', () => {
    expect(primeiroEUltimoNome('Pedro Henrique Alves filho')).toBe('Pedro Alves filho')
  })
  it('nome curto fica como está', () => {
    expect(primeiroEUltimoNome('Pedro')).toBe('Pedro')
    expect(primeiroEUltimoNome('  Ana   Souza ')).toBe('Ana Souza')
    expect(primeiroEUltimoNome('Pedro Filho')).toBe('Pedro Filho')
  })
})
