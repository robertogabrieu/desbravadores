const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** "2030-09-27" vira "27 set". */
export function formatarDiaMes(data: string): string {
  const [, mes, dia] = data.split('-')
  return `${dia} ${MESES[Number(mes) - 1]}`
}

/** "2030-09-27" vira "Sex, 27 set". */
export function formatarDataCurta(data: string): string {
  const diaDaSemana = new Date(`${data}T00:00:00Z`).getUTCDay()
  return `${DIAS_DA_SEMANA[diaDaSemana]}, ${formatarDiaMes(data)}`
}

/** "08:30" vira "8h30" e "09:00" vira "9h". */
export function formatarHorario(horario: string): string {
  const [hora, minuto] = horario.split(':')
  return minuto === '00' ? `${Number(hora)}h` : `${Number(hora)}h${minuto}`
}

export const TRACO = '—'
