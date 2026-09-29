import { SituacaoChamada } from './situacao'

export function frequencia(situacoes: SituacaoChamada[]): number | null {
  if (situacoes.length === 0) return null
  const presencas = situacoes.filter((s) => s === 'PRESENTE' || s === 'ATRASADO').length
  return (presencas / situacoes.length) * 100
}
