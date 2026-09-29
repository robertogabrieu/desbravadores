import { describe, expect, it } from 'vitest'
import { Criterio, pontosDaChamada, pontosPorCriterio } from './pontos'

const padrao: Criterio[] = [
  { gatilho: 'PRESENCA', pontos: 10, ativo: true },
  { gatilho: 'PONTUALIDADE', pontos: 5, ativo: true },
  { gatilho: 'UNIFORME', pontos: 5, ativo: true },
  { gatilho: 'BIBLIA', pontos: 3, ativo: true },
  { gatilho: 'LICAO', pontos: 3, ativo: false },
]
const semDesconto = { descontarFalta: false, pontosDescontoFalta: 2 }
const comDesconto = { descontarFalta: true, pontosDescontoFalta: 2 }
const marca = { situacao: 'PRESENTE' as const, uniforme: false, biblia: false, licao: false }

describe('pontosDaChamada', () => {
  it('presente, pontual, uniforme e Bíblia somam 23', () => {
    expect(pontosDaChamada({ ...marca, uniforme: true, biblia: true }, padrao, semDesconto)).toBe(23)
  })
  it('presente atrasado sem uniforme nem Bíblia soma só a presença (10)', () => {
    expect(pontosDaChamada({ ...marca, situacao: 'ATRASADO' }, padrao, semDesconto)).toBe(10)
  })
  it('falta sem desconto vale 0', () => {
    expect(pontosDaChamada({ ...marca, situacao: 'FALTA' }, padrao, semDesconto)).toBe(0)
  })
  it('falta com desconto vale -2', () => {
    expect(pontosDaChamada({ ...marca, situacao: 'FALTA' }, padrao, comDesconto)).toBe(-2)
  })
  it('falta justificada vale 0 mesmo com desconto', () => {
    expect(pontosDaChamada({ ...marca, situacao: 'FALTA_JUSTIFICADA' }, padrao, comDesconto)).toBe(0)
  })
  it('Lição marcada com critério desligado não soma', () => {
    expect(pontosDaChamada({ ...marca, uniforme: true, biblia: true, licao: true }, padrao, semDesconto)).toBe(23)
  })
  it('Lição marcada com critério ligado soma 3', () => {
    const criterios = padrao.map((c) => (c.gatilho === 'LICAO' ? { ...c, ativo: true } : c))
    expect(pontosDaChamada({ ...marca, uniforme: true, biblia: true, licao: true }, criterios, semDesconto)).toBe(26)
  })
  it('presença desligada tira os 10', () => {
    const criterios = padrao.map((c) => (c.gatilho === 'PRESENCA' ? { ...c, ativo: false } : c))
    expect(pontosDaChamada({ ...marca, uniforme: true, biblia: true }, criterios, semDesconto)).toBe(13)
  })
  it('gatilhos que não vêm da chamada não somam', () => {
    const criterios: Criterio[] = [...padrao, { gatilho: 'MANUAL', pontos: 20, ativo: true }]
    expect(pontosDaChamada(marca, criterios, semDesconto)).toBe(15)
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
    expect(pontosPorCriterio(marca, todos, semDesconto)).toEqual([
      { gatilho: 'PRESENCA', pontos: 10 },
      { gatilho: 'PONTUALIDADE', pontos: 5 },
    ])
  })
  it('atrasado não ganha pontualidade', () => {
    expect(pontosPorCriterio({ ...marca, situacao: 'ATRASADO' }, todos, semDesconto)).toEqual([
      { gatilho: 'PRESENCA', pontos: 10 },
    ])
  })
  it('uniforme, Bíblia e lição entram quando marcados', () => {
    const itens = pontosPorCriterio({ ...marca, uniforme: true, biblia: true, licao: true }, todos, semDesconto)
    expect(itens.map((item) => item.gatilho)).toEqual(['PRESENCA', 'PONTUALIDADE', 'UNIFORME', 'BIBLIA', 'LICAO'])
  })
  it('critério inativo não gera item', () => {
    expect(pontosPorCriterio(marca, padrao.map((c) => ({ ...c, ativo: false })), semDesconto)).toEqual([])
    expect(pontosPorCriterio({ ...marca, licao: true }, padrao, semDesconto)).toEqual([
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
    expect(pontosPorCriterio(marca, outros, semDesconto)).toEqual([])
  })
  it('falta com desconto gera um item FALTA negativo', () => {
    expect(pontosPorCriterio({ ...marca, situacao: 'FALTA' }, padrao, comDesconto)).toEqual([
      { gatilho: 'FALTA', pontos: -2 },
    ])
  })
  it('falta sem desconto não gera item', () => {
    expect(pontosPorCriterio({ ...marca, situacao: 'FALTA' }, padrao, semDesconto)).toEqual([])
  })
  it('falta justificada não gera item, mesmo com desconto', () => {
    expect(pontosPorCriterio({ ...marca, situacao: 'FALTA_JUSTIFICADA' }, padrao, comDesconto)).toEqual([])
  })
  it('a soma dos itens é sempre pontosDaChamada', () => {
    const situacoes = ['PRESENTE', 'ATRASADO', 'FALTA', 'FALTA_JUSTIFICADA'] as const
    for (const situacao of situacoes) {
      for (const flags of [false, true]) {
        for (const config of [semDesconto, comDesconto]) {
          for (const criterios of [padrao, todos]) {
            const m = { situacao, uniforme: flags, biblia: flags, licao: flags }
            const soma = pontosPorCriterio(m, criterios, config).reduce((t, i) => t + i.pontos, 0)
            expect(soma).toBe(pontosDaChamada(m, criterios, config))
          }
        }
      }
    }
  })
})
