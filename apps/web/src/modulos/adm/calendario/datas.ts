import { MesCivil, datasDoIntervalo } from '@desbravadores/shared'
import type { EventoCalendario } from '../../../api/calendario'
import { juntarNomes } from '../formatos'

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

/** `AAAA-MM` do endereço → ano e mês (0 a 11); valor ausente ou inválido cai no mês de `hoje` (`AAAA-MM-DD`). */
export function mesDoEndereco(valor: string, hoje: string): { ano: number; mes: number } {
  const valido = MesCivil.safeParse(valor).success
  const referencia = valido ? valor : hoje
  return { ano: Number(referencia.slice(0, 4)), mes: Number(referencia.slice(5, 7)) - 1 }
}

/** `AAAA-MM` de um ano e mês (0 a 11). */
export const chaveDoMes = (ano: number, mes: number): string => `${ano}-${doisDigitos(mes + 1)}`

const NOMES_DO_DIA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const NOS_DIAS = ['nos domingos', 'nas segundas-feiras', 'nas terças-feiras', 'nas quartas-feiras', 'nas quintas-feiras', 'nas sextas-feiras', 'nos sábados']
const DO_DIA = ['do domingo', 'da segunda-feira', 'da terça-feira', 'da quarta-feira', 'da quinta-feira', 'da sexta-feira', 'do sábado']

/** 0 = domingo. */
export const diaDaSemana = (data: string): number => new Date(`${data}T00:00:00Z`).getUTCDay()

const numeroDoDia = (data: string): number => Number(data.slice(8, 10))

/** "domingo 18", "quarta-feira 21". */
export const diaPorExtenso = (data: string): string => `${NOMES_DO_DIA[diaDaSemana(data)]} ${numeroDoDia(data)}`

/** Nome do dia de reunião; sem a configuração (carregando ou com erro), a expressão genérica. */
export function dosDiasDeReuniao(diaReuniao: number | undefined): { nome: string; nos: string; do: string } {
  if (diaReuniao === undefined) return { nome: 'dia de reunião', nos: 'nos dias de reunião', do: 'do dia de reunião' }
  return { nome: NOMES_DO_DIA[diaReuniao] ?? '', nos: NOS_DIAS[diaReuniao] ?? '', do: DO_DIA[diaReuniao] ?? '' }
}

/** As datas de `inicio` a `fim` que caem em `diaDaSemanaDesejado`. */
export const datasDoDiaDaSemana = (inicio: string, fim: string, diaDaSemanaDesejado: number): string[] =>
  datasDoIntervalo(inicio, fim).filter((data) => diaDaSemana(data) === diaDaSemanaDesejado)

const MAXIMO_DE_DIAS_NA_LISTA = 3
const diaEMesSemZero = (data: string): string => `${numeroDoDia(data)}/${data.slice(5, 7)}`
const nomeCurto = (data: string): string => (NOMES_DO_DIA[diaDaSemana(data)] ?? '').replace('-feira', '')

/**
 * Datas em texto curto, em ordem: "domingo 18"; seguidas viram "sexta 16 a domingo 18"; do mesmo dia da semana
 * viram "domingos 11 e 18" ou, passando de três, "9 domingos, de 7/12 a 1/02".
 */
export function textoDosDias(datas: string[]): string {
  const primeira = datas[0]
  const ultima = datas[datas.length - 1]
  if (primeira === undefined || ultima === undefined) return ''
  const curto = (data: string): string => `${nomeCurto(data)} ${numeroDoDia(data)}`
  if (datas.length === 1) return curto(primeira)
  const seguidas = datas.every((data, i) => i === 0 || datasDoIntervalo(datas[i - 1] ?? data, data).length === 2)
  if (seguidas) return `${curto(primeira)} a ${curto(ultima)}`
  const plural = `${nomeCurto(primeira)}s`
  if (datas.length > MAXIMO_DE_DIAS_NA_LISTA) return `${datas.length} ${plural}, de ${diaEMesSemZero(primeira)} a ${diaEMesSemZero(ultima)}`
  return `${plural} ${juntarNomes(datas.map((data) => String(numeroDoDia(data))))}`
}
