import type { DataDaMontagem } from '../../api/montagem'

const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'] as const
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'] as const

/** "2026-10-04" → "04/10". */
export const diaMes = (data: string): string => `${data.slice(8, 10)}/${data.slice(5, 7)}`

const MESES_POR_EXTENSO = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const

/** "2026-10-04" → "2026-10": a chave do mês. */
export const chaveDoMes = (data: string): string => data.slice(0, 7)

/** "2026-10-04" → "Outubro de 2026". */
export const mesPorExtenso = (data: string): string => `${MESES_POR_EXTENSO[Number(data.slice(5, 7)) - 1] ?? ''} de ${data.slice(0, 4)}`

/** "2026-10-04" → "Out". */
export function mesAbreviado(data: string): string {
  const mes = MESES[Number(data.slice(5, 7)) - 1] ?? ''
  return `${mes.charAt(0)}${mes.slice(1).toLowerCase()}`
}

/** "2026-10-04" → "Dom, 04/10". */
export function diaDaSemanaEData(data: string): string {
  const { semana } = partesDaData(data)
  return `${semana.charAt(0)}${semana.slice(1).toLowerCase()}, ${diaMes(data)}`
}

/** "2026-10-04" → { semana: 'DOM', dia: '04', mes: 'OUT' }. */
export function partesDaData(data: string): { semana: string; dia: string; mes: string } {
  const semana = DIAS[new Date(`${data}T00:00:00Z`).getUTCDay()] ?? ''
  return { semana, dia: data.slice(8, 10), mes: MESES[Number(data.slice(5, 7)) - 1] ?? '' }
}

/** Dia sem classe: o dia não tem classe e (nada marcado nele ou algum evento tira a classe). Férias com classe marcada segue aberta. */
export const dataBloqueada = ({ situacao, aulaId }: DataDaMontagem): boolean =>
  !situacao.temClasse && (aulaId === null || !situacao.classeLiberada)

/** Nome(s) do evento + rótulo pelas marcações; vazio quando a data não tem nada de especial. */
export function textoDaData(dado: DataDaMontagem): string {
  const { situacao } = dado
  const bloqueada = dataBloqueada(dado)
  const rotulos: string[] = []
  const temEventoComum = situacao.eventos.length > (situacao.extra ? 1 : 0)
  if (bloqueada) rotulos.push('sem classe')
  if (situacao.bomParaCampo) rotulos.push('ótimo para campo')
  if (temEventoComum && situacao.reuniaoMantida && !bloqueada) rotulos.push('reunião mantida')
  if (situacao.extra?.temClasse) rotulos.push('reunião extra')
  return [situacao.eventos.join(', '), ...rotulos].filter(Boolean).join(' · ')
}

/** Dia anterior a `data` ("AAAA-MM-DD"). */
export function vesperaDe(data: string): string {
  const anterior = new Date(`${data}T00:00:00Z`)
  anterior.setUTCDate(anterior.getUTCDate() - 1)
  return anterior.toISOString().slice(0, 10)
}

/** Período padrão de um cronograma novo: o ano do clube, do início até a véspera do próximo (G5). */
export const periodoPadrao = (ano: number, inicioAnoClube: string): { inicio: string; fim: string } => ({
  inicio: `${ano}-${inicioAnoClube}`,
  fim: vesperaDe(`${ano + 1}-${inicioAnoClube}`),
})

/** "09:15 · Sala 2 · Título" com o que existir. */
export const detalheDaAula = (d: DataDaMontagem): string => [d.horario, d.local, d.titulo].filter(Boolean).join(' · ')

/** Colocar requisito novo na data: fora bloqueio e aula dada; nas individuais, também fora data em conflito (a API responde 422). */
export const aceitaRequisitoNovo = (montagem: { datasLivres: boolean }, dado: DataDaMontagem): boolean =>
  !dataBloqueada(dado) && !dado.aulaDada && (montagem.datasLivres || !dado.conflito)

/** Nas individuais, tirar o único requisito apaga o dia de classe: pesa quando o dia tem horário, local ou título próprios, que se perdem. */
export const diaComDadosSomeAoTirar = (montagem: { datasLivres: boolean }, dado: DataDaMontagem): boolean =>
  !montagem.datasLivres && dado.requisitoIds.length === 1 && detalheDaAula(dado) !== ''
