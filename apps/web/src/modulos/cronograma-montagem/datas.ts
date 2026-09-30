import type { DataDaMontagem } from '../../api/montagem'

const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'] as const
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'] as const

/** "2026-10-04" → "04/10". */
export const diaMes = (data: string): string => `${data.slice(8, 10)}/${data.slice(5, 7)}`

/** "2026-10-04" → { semana: 'DOM', dia: '04', mes: 'OUT' }. */
export function partesDaData(data: string): { semana: string; dia: string; mes: string } {
  const semana = DIAS[new Date(`${data}T00:00:00Z`).getUTCDay()] ?? ''
  return { semana, dia: data.slice(8, 10), mes: MESES[Number(data.slice(5, 7)) - 1] ?? '' }
}

/** Nome(s) do evento + rótulo pelas marcações; vazio quando a data não tem nada de especial. */
export function textoDaData({ situacao }: DataDaMontagem): string {
  const rotulos: string[] = []
  if (situacao.bloqueiaAula) rotulos.push('sem aula de classe')
  if (situacao.bomParaCampo) rotulos.push('ótimo para campo')
  if (situacao.eventos.length > 0 && !situacao.cancelaReuniao && !situacao.bloqueiaAula) rotulos.push('reunião mantida')
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
