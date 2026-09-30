/** "2030-09-10" vira "10/09". */
export const diaEMesCurto = (data: string): string => `${data.slice(8, 10)}/${data.slice(5, 7)}`

const FUSO_PADRAO = 'America/Sao_Paulo'

/** "27/09 às 10h02", no fuso do clube. */
export function diaEHora(instante: string): string {
  const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_PADRAO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instante))
  const valor = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? ''
  return `${valor('day')}/${valor('month')} às ${valor('hour')}h${valor('minute')}`
}

/** Minúsculas e sem acento, para a busca. */
export const semAcento = (texto: string): string =>
  texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
