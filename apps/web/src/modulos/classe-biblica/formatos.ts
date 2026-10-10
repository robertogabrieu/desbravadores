const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** "2026-10-11" vira "11/10". */
export function diaMes(data: string): string {
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

/** "2026-10-11" vira "domingo". */
export const diaDaSemana = (data: string): string => DIAS[new Date(`${data}T12:00:00Z`).getUTCDay()] ?? ''
