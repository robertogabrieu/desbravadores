import { describe, expect, it } from 'vitest'
import { Criterio, pontosDaChamada } from './pontos'

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
