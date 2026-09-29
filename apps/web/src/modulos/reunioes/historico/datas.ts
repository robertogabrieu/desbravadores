const MESES_ABREVIADOS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const NOMES_DOS_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Soma `delta` meses a um `AAAA-MM`. */
export function somarMeses(mes: string, delta: number): string {
  const [ano, numero] = mes.split('-').map(Number)
  const total = ano * 12 + (numero - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** "2026-09" → "setembro de 2026". */
export function nomeDoMes(mes: string): string {
  const [ano, numero] = mes.split('-').map(Number)
  return `${NOMES_DOS_MESES[numero - 1]} de ${ano}`
}

/** "2026-09-20" → dia "20" e mês "SET" (a data é civil: sem fuso). */
export function diaEMes(data: string): { dia: string; mes: string } {
  const [, mes, dia] = data.split('-').map(Number)
  return { dia: String(dia).padStart(2, '0'), mes: MESES_ABREVIADOS[mes - 1] }
}
