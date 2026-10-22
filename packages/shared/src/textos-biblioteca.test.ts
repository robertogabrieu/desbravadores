import { describe, expect, it } from 'vitest'
import { textoDeDias, textoDeDisponibilidade, textoDeSituacao } from './textos-biblioteca'

describe('textoDeDisponibilidade', () => {
  it('mais de um exemplar: "N de M disponíveis"', () => {
    expect(textoDeDisponibilidade(3, 2)).toBe('2 de 3 disponíveis')
    expect(textoDeDisponibilidade(3, 1)).toBe('1 de 3 disponíveis')
  })
  it('um exemplar livre: "1 de 1 disponível"', () => {
    expect(textoDeDisponibilidade(1, 1)).toBe('1 de 1 disponível')
  })
  it('nenhum livre: "Todos emprestados"', () => {
    expect(textoDeDisponibilidade(2, 0)).toBe('Todos emprestados')
    expect(textoDeDisponibilidade(1, 0)).toBe('Todos emprestados')
  })
  it('sem exemplares ativos: "Sem exemplares"', () => {
    expect(textoDeDisponibilidade(0, 0)).toBe('Sem exemplares')
  })
})

describe('textoDeDias e textoDeSituacao', () => {
  it('singular e plural', () => {
    expect(textoDeDias(1)).toBe('1 dia')
    expect(textoDeDias(5)).toBe('5 dias')
  })
  it('situação', () => {
    expect(textoDeSituacao('NO_PRAZO', 0)).toBe('No prazo')
    expect(textoDeSituacao('VENCE_HOJE', 0)).toBe('Vence hoje')
    expect(textoDeSituacao('ATRASADO', 1)).toBe('Atrasado há 1 dia')
    expect(textoDeSituacao('ATRASADO', 9)).toBe('Atrasado há 9 dias')
  })
})
