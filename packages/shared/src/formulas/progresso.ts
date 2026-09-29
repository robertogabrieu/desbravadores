export function percentualClasse(concluidos: number, total: number): number {
  if (total === 0) return 0
  return (concluidos / total) * 100
}

export function mediaTurma(percentuais: number[]): number {
  if (percentuais.length === 0) return 0
  const soma = percentuais.reduce((acumulado, valor) => acumulado + valor, 0)
  return Math.round(soma / percentuais.length)
}

export function prontoParaInvestidura(percentualRegular: number): boolean {
  return percentualRegular === 100
}
