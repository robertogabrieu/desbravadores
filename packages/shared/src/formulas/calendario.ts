import type { z } from 'zod'
import type { SITUACOES_AULA, SituacaoData } from '../contratos/cronograma'
import type { Trilha } from '../enums'

export type SituacaoDeData = z.infer<typeof SituacaoData>
export type SituacaoAula = (typeof SITUACOES_AULA)[number]

/** O que as fórmulas precisam de um evento do calendário; `removido` = já removido (ignorado). */
export interface EventoDoCalendario {
  nome: string
  inicio: string
  fim: string
  cancelaReuniao: boolean
  bloqueiaAula: boolean
  bomParaCampo: boolean
  removido?: boolean
}

const UM_DIA_MS = 86_400_000

function instante(data: string): number {
  return Date.parse(`${data}T00:00:00Z`)
}

/** Datas civis de `inicio` a `fim`, inclusive; vazio se o fim vem antes do início. */
export function datasDoIntervalo(inicio: string, fim: string): string[] {
  const datas: string[] = []
  for (let t = instante(inicio); t <= instante(fim); t += UM_DIA_MS) datas.push(new Date(t).toISOString().slice(0, 10))
  return datas
}

function diaDaSemana(data: string): number {
  return new Date(instante(data)).getUTCDay()
}

/** B4: basta um evento que cubra a data para a marcação valer. */
export function situacaoDaData(data: string, eventos: readonly EventoDoCalendario[]): SituacaoDeData {
  const doDia = eventos.filter((evento) => !evento.removido && evento.inicio <= data && data <= evento.fim)
  return {
    cancelaReuniao: doDia.some((evento) => evento.cancelaReuniao),
    bloqueiaAula: doDia.some((evento) => evento.bloqueiaAula),
    bomParaCampo: doDia.some((evento) => evento.bomParaCampo),
    eventos: doDia.map((evento) => evento.nome),
  }
}

/** Dias do período que caem no `diaReuniao` (0 = domingo) e não foram cancelados. */
export function diasDeReuniao(inicio: string, fim: string, diaReuniao: number, eventos: readonly EventoDoCalendario[]): string[] {
  return datasDoIntervalo(inicio, fim).filter(
    (data) => diaDaSemana(data) === diaReuniao && !situacaoDaData(data, eventos).cancelaReuniao,
  )
}

/** B5, trilha individual: dias de reunião mais as datas `bomParaCampo`, sempre sem `bloqueiaAula`. */
export function datasDeAula(inicio: string, fim: string, diaReuniao: number, eventos: readonly EventoDoCalendario[]): string[] {
  return datasDoIntervalo(inicio, fim).filter((data) => {
    const situacao = situacaoDaData(data, eventos)
    if (situacao.bloqueiaAula) return false
    return situacao.bomParaCampo || (diaDaSemana(data) === diaReuniao && !situacao.cancelaReuniao)
  })
}

export interface EntradaEmConflito {
  trilha: z.infer<typeof Trilha>
  temRequisitos: boolean
  temRegistro: boolean
  data: string
  hoje: string
  situacaoDaData: SituacaoDeData
}

/** B6: a data deixou de ser data de aula (B5) para uma aula individual futura, com requisitos e sem registro. */
export function emConflito(entrada: EntradaEmConflito): boolean {
  const { situacaoDaData: situacao } = entrada
  const deixouDeSerDataDeAula = situacao.bloqueiaAula || (situacao.cancelaReuniao && !situacao.bomParaCampo)
  return (
    entrada.trilha === 'INDIVIDUAL' &&
    entrada.temRequisitos &&
    !entrada.temRegistro &&
    entrada.data >= entrada.hoje &&
    deixouDeSerDataDeAula
  )
}

export function situacaoDaAula(entrada: { temRegistro: boolean; emConflito: boolean; data: string; hoje: string }): SituacaoAula {
  if (entrada.temRegistro) return 'DADA'
  if (entrada.emConflito) return 'CONFLITO'
  if (entrada.data === entrada.hoje) return 'HOJE'
  if (entrada.data < entrada.hoje) return 'NAO_REGISTRADA'
  return 'PLANEJADA'
}
