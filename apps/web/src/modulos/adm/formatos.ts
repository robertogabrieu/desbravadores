import { hojeNoFuso } from '@desbravadores/shared'

export const FUSO_PADRAO_DO_CLUBE = 'America/Sao_Paulo'

const DIAS_POR_EXTENSO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function partesDaData(data: string): { ano: number; mes: number; dia: number; diaDaSemana: number } {
  const [ano, mes, dia] = data.split('-').map(Number)
  return { ano, mes, dia, diaDaSemana: new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() }
}

/** "2016-01-15" → "15/01/2016" */
export function dataCivilBr(data: string): string {
  const { ano, mes, dia } = partesDaData(data)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`
}

/** "2026-09-27" → "Domingo, 27 de setembro" */
export function dataPorExtenso(data: string): string {
  const { mes, dia, diaDaSemana } = partesDaData(data)
  return `${DIAS_POR_EXTENSO[diaDaSemana]}, ${dia} de ${MESES[mes - 1]}`
}

/** "sex 16 a dom 18 de outubro"; dia único: "sáb 17 de outubro". */
export function periodoPorExtenso(inicio: string, fim: string): string {
  const de = partesDaData(inicio)
  const ate = partesDaData(fim)
  const curto = (p: ReturnType<typeof partesDaData>) => `${DIAS_CURTOS[p.diaDaSemana]} ${p.dia}`
  if (inicio === fim) return `${curto(de)} de ${MESES[de.mes - 1]}`
  if (de.mes === ate.mes && de.ano === ate.ano) return `${curto(de)} a ${curto(ate)} de ${MESES[ate.mes - 1]}`
  return `${curto(de)} de ${MESES[de.mes - 1]} a ${curto(ate)} de ${MESES[ate.mes - 1]}`
}

/** "09:00" → "9h", "09:30" → "9h30" */
export function horaCurta(horario: string): string {
  const [hora, minuto] = horario.split(':').map(Number)
  return minuto === 0 ? `${hora}h` : `${hora}h${String(minuto).padStart(2, '0')}`
}

/** "27/09 às 11:02" no fuso do clube. */
export function instanteCurto(instante: string, fuso: string): string {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instante))
  const valor = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? '00'
  return `${valor('day')}/${valor('month')} às ${valor('hour')}:${valor('minute')}`
}

/** "a, b e c" */
export function juntarNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join('')
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
}

export function textoDoUltimoAcesso(instante: string | null, agora: Date, fuso: string): string {
  if (instante === null) return 'nunca acessou'
  const diaDoAcesso = hojeNoFuso(fuso, new Date(instante))
  if (diaDoAcesso === hojeNoFuso(fuso, agora)) return 'último acesso hoje'
  if (diaDoAcesso === hojeNoFuso(fuso, new Date(agora.getTime() - 24 * 60 * 60 * 1000))) return 'último acesso ontem'
  return `último acesso em ${dataCivilBr(diaDoAcesso)}`
}
