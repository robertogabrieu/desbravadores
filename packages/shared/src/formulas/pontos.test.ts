import { describe, expect, it } from 'vitest'
import { Criterio, pontosDaChamada, pontosPorCriterio } from './pontos'

const padrao: Criterio[] = [
  { gatilho: 'PRESENCA', pontos: 10, ativo: true },
  { gatilho: 'PONTUALIDADE', pontos: 5, ativo: true },
  { gatilho: 'UNIFORME', pontos: 5, ativo: true },
  { gatilho: 'BIBLIA', pontos: 3, ativo: true },
  { gatilho: 'LICAO', pontos: 3, ativo: false },
]
const marca = { situacao: 'PRESENTE' as const, uniforme: false, biblia: false, licao: false }

describe('pontosDaChamada', () => {
  it('presente, pontual, uniforme e Bíblia somam 23', () => {
    expect(pontosDaChamada({ ...marca, uniforme: true, biblia: true }, padrao)).toBe(23)
  })
  it('presente atrasado sem uniforme nem Bíblia soma só a presença (10)', () => {
    expect(pontosDaChamada({ ...marca, situacao: 'ATRASADO' }, padrao)).toBe(10)
  })
  it('falta vale 0', () => {
    expect(pontosDaChamada({ ...marca, situacao: 'FALTA' }, padrao)).toBe(0)
  })
  it('falta justificada vale 0', () => {
    expect(pontosDaChamada({ ...marca, situacao: 'FALTA_JUSTIFICADA' }, padrao)).toBe(0)
  })
  it('Lição marcada com critério desligado não soma', () => {
    expect(pontosDaChamada({ ...marca, uniforme: true, biblia: true, licao: true }, padrao)).toBe(23)
  })
  it('Lição marcada com critério ligado soma 3', () => {
    const criterios = padrao.map((c) => (c.gatilho === 'LICAO' ? { ...c, ativo: true } : c))
    expect(pontosDaChamada({ ...marca, uniforme: true, biblia: true, licao: true }, criterios)).toBe(26)
  })
  it('presença desligada tira os 10', () => {
    const criterios = padrao.map((c) => (c.gatilho === 'PRESENCA' ? { ...c, ativo: false } : c))
    expect(pontosDaChamada({ ...marca, uniforme: true, biblia: true }, criterios)).toBe(13)
  })
  it('gatilhos que não vêm da chamada não somam', () => {
    const criterios: Criterio[] = [...padrao, { gatilho: 'MANUAL', pontos: 20, ativo: true }]
    expect(pontosDaChamada(marca, criterios)).toBe(15)
  })
})

describe('pontosPorCriterio', () => {
  const todos: Criterio[] = [
    { gatilho: 'PRESENCA', pontos: 10, ativo: true },
    { gatilho: 'PONTUALIDADE', pontos: 5, ativo: true },
    { gatilho: 'UNIFORME', pontos: 5, ativo: true },
    { gatilho: 'BIBLIA', pontos: 3, ativo: true },
    { gatilho: 'LICAO', pontos: 4, ativo: true },
  ]

  it('presente pontual sem extras rende presença e pontualidade', () => {
    expect(pontosPorCriterio(marca, todos)).toEqual([
      { gatilho: 'PRESENCA', pontos: 10 },
      { gatilho: 'PONTUALIDADE', pontos: 5 },
    ])
  })
  it('atrasado não ganha pontualidade', () => {
    expect(pontosPorCriterio({ ...marca, situacao: 'ATRASADO' }, todos)).toEqual([
      { gatilho: 'PRESENCA', pontos: 10 },
    ])
  })
  it('uniforme, Bíblia e lição entram quando marcados', () => {
    const itens = pontosPorCriterio({ ...marca, uniforme: true, biblia: true, licao: true }, todos)
    expect(itens.map((item) => item.gatilho)).toEqual(['PRESENCA', 'PONTUALIDADE', 'UNIFORME', 'BIBLIA', 'LICAO'])
  })
  it('critério inativo não gera item', () => {
    expect(pontosPorCriterio(marca, padrao.map((c) => ({ ...c, ativo: false })))).toEqual([])
    expect(pontosPorCriterio({ ...marca, licao: true }, padrao)).toEqual([
      { gatilho: 'PRESENCA', pontos: 10 },
      { gatilho: 'PONTUALIDADE', pontos: 5 },
    ])
  })
  it('gatilhos fora da chamada (MANUAL, REQUISITO) são ignorados', () => {
    const outros: Criterio[] = [
      { gatilho: 'MANUAL', pontos: 9, ativo: true },
      { gatilho: 'REQUISITO', pontos: 9, ativo: true },
      { gatilho: 'ESPECIALIDADE', pontos: 9, ativo: true },
    ]
    expect(pontosPorCriterio(marca, outros)).toEqual([])
  })
  it('falta não gera item', () => {
    expect(pontosPorCriterio({ ...marca, situacao: 'FALTA' }, padrao)).toEqual([])
  })
  it('falta justificada não gera item', () => {
    expect(pontosPorCriterio({ ...marca, situacao: 'FALTA_JUSTIFICADA' }, padrao)).toEqual([])
  })
  it('nenhum item de nenhuma marcação é negativo', () => {
    for (const situacao of ['PRESENTE', 'ATRASADO', 'FALTA', 'FALTA_JUSTIFICADA'] as const) {
      const itens = pontosPorCriterio({ situacao, uniforme: true, biblia: true, licao: true }, todos)
      expect(itens.every((item) => item.pontos >= 0)).toBe(true)
    }
  })
  it('a soma dos itens é sempre pontosDaChamada', () => {
    const situacoes = ['PRESENTE', 'ATRASADO', 'FALTA', 'FALTA_JUSTIFICADA'] as const
    for (const situacao of situacoes) {
      for (const flags of [false, true]) {
        for (const criterios of [padrao, todos]) {
          const m = { situacao, uniforme: flags, biblia: flags, licao: flags }
          const soma = pontosPorCriterio(m, criterios).reduce((t, i) => t + i.pontos, 0)
          expect(soma).toBe(pontosDaChamada(m, criterios))
        }
      }
    }
  })
})
