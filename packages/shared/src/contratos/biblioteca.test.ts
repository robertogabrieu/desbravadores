import { describe, expect, it } from 'vitest'
import {
  AcrescentarExemplares,
  EmprestimoEntrada,
  ItemBibliotecaSaida,
  LivroFisicoEntrada,
  SituacaoDosEmprestimos,
} from './biblioteca'

const id = '0190f3a0-0000-7000-8000-000000000001'

describe('EmprestimoEntrada', () => {
  it('aceita exemplar e desbravador, com data de empréstimo opcional', () => {
    expect(EmprestimoEntrada.safeParse({ exemplarId: id, desbravadorId: id }).success).toBe(true)
    expect(EmprestimoEntrada.safeParse({ exemplarId: id, desbravadorId: id, emprestadoEm: '2026-10-01' }).success).toBe(true)
  })
  it('recusa qualquer campo de devolução', () => {
    for (const campo of ['devolverAte', 'devolvidoEm', 'prazo']) {
      expect(EmprestimoEntrada.safeParse({ exemplarId: id, desbravadorId: id, [campo]: '2026-12-01' }).success).toBe(false)
    }
  })
})

describe('quantidade de exemplares', () => {
  const base = { nome: 'Livro', descricao: null, categoriaId: id }
  it('vai de 1 a 50', () => {
    expect(LivroFisicoEntrada.safeParse({ ...base, quantidade: 1 }).success).toBe(true)
    expect(LivroFisicoEntrada.safeParse({ ...base, quantidade: 50 }).success).toBe(true)
    expect(LivroFisicoEntrada.safeParse({ ...base, quantidade: 0 }).success).toBe(false)
    expect(LivroFisicoEntrada.safeParse({ ...base, quantidade: 51 }).success).toBe(false)
    expect(LivroFisicoEntrada.safeParse({ ...base, quantidade: 1.5 }).success).toBe(false)
    expect(AcrescentarExemplares.safeParse({ quantidade: 51 }).success).toBe(false)
    expect(AcrescentarExemplares.safeParse({ quantidade: 3 }).success).toBe(true)
  })
})

describe('ItemBibliotecaSaida', () => {
  const comum = { id, categoriaId: id, nome: 'L', descricao: null, capaUrl: null }
  it('digital traz bytes e urls', () => {
    expect(ItemBibliotecaSaida.safeParse({ ...comum, tipo: 'DIGITAL', bytes: 1, urlLer: 'a', urlBaixar: 'b' }).success).toBe(true)
    expect(ItemBibliotecaSaida.safeParse({ ...comum, tipo: 'DIGITAL' }).success).toBe(false)
  })
  it('físico traz total e disponiveis, sem bytes nem urls', () => {
    const fisico = ItemBibliotecaSaida.parse({ ...comum, tipo: 'FISICO', total: 3, disponiveis: 2, bytes: 1, urlLer: 'a', urlBaixar: 'b' })
    expect(fisico).toEqual({ ...comum, tipo: 'FISICO', total: 3, disponiveis: 2 })
    expect(ItemBibliotecaSaida.safeParse({ ...comum, tipo: 'FISICO' }).success).toBe(false)
  })
  it('recusa tipo desconhecido', () => {
    expect(ItemBibliotecaSaida.safeParse({ ...comum, tipo: 'OUTRO' }).success).toBe(false)
  })
})

describe('SituacaoDosEmprestimos', () => {
  it('aceita os quatro filtros e recusa outro', () => {
    for (const s of ['todas', 'atrasados', 'vencem-hoje', 'no-prazo']) expect(SituacaoDosEmprestimos.safeParse(s).success).toBe(true)
    expect(SituacaoDosEmprestimos.safeParse('vencidos').success).toBe(false)
  })
})
