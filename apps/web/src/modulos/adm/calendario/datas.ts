import type { EventoCalendario } from '../../../api/calendario'

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
export const DIAS_DA_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

const doisDigitos = (n: number): string => String(n).padStart(2, '0')

/** `AAAA-MM-DD` de um dia; `mes` conta de 0 (janeiro) a 11. */
export const chaveDoDia = (ano: number, mes: number, dia: number): string => `${ano}-${doisDigitos(mes + 1)}-${doisDigitos(dia)}`

/** Uma posição por célula da grade dom–sáb: `null` nos vazios antes do dia 1 e depois do último dia. */
export function diasDaGrade(ano: number, mes: number): (number | null)[] {
  const primeiroDaSemana = new Date(Date.UTC(ano, mes, 1)).getUTCDay()
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
  const celulas: (number | null)[] = [...Array<null>(primeiroDaSemana).fill(null), ...Array.from({ length: ultimoDia }, (_, i) => i + 1)]
  while (celulas.length % 7 !== 0) celulas.push(null)
  return celulas
}

export const eventosDoDia = (eventos: EventoCalendario[], data: string): EventoCalendario[] =>
  eventos.filter((evento) => evento.inicio <= data && data <= evento.fim)

/** Eventos que tocam o mês, na ordem em que vieram (por início). */
export function eventosDoMes(eventos: EventoCalendario[], ano: number, mes: number): EventoCalendario[] {
  const primeiro = chaveDoDia(ano, mes, 1)
  const ultimo = chaveDoDia(ano, mes, new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate())
  return eventos.filter((evento) => evento.inicio <= ultimo && evento.fim >= primeiro)
}

/** `AAAA-MM-DD` → `DD/MM`. */
export const diaEMes = (data: string): string => `${data.slice(8, 10)}/${data.slice(5, 7)}`

/** `AAAA-MM-DD` → `DD/MM/AAAA`. */
export const dataBrasileira = (data: string): string => `${diaEMes(data)}/${data.slice(0, 4)}`
