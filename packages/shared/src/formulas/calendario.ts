import type { z } from 'zod'
import type { SITUACOES_AULA, SituacaoData } from '../contratos/cronograma'
import type { TipoEvento, Trilha } from '../enums'

export type SituacaoDeData = z.infer<typeof SituacaoData>
export type ExtraDaData = NonNullable<SituacaoDeData['extra']>
export type SituacaoAula = (typeof SITUACOES_AULA)[number]

/** O que as fórmulas precisam de um evento do calendário; `removido` = já removido (ignorado). */
export interface EventoDoCalendario {
  nome: string
  tipo: z.infer<typeof TipoEvento>
  inicio: string
  fim: string
  horario: string | null
  local: string | null
  temReuniao: boolean
  temClasse: boolean
  bomParaCampo: boolean
  removido?: boolean
}

/** Janela da próxima reunião e do calendário do pacote: cobre férias de dezembro a fevereiro. */
export const JANELA_DO_CALENDARIO_EM_DIAS = 120

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

function somarDias(data: string, dias: number): string {
  return new Date(instante(data) + dias * UM_DIA_MS).toISOString().slice(0, 10)
}

function cobre(data: string) {
  return (evento: EventoDoCalendario): boolean => !evento.removido && evento.inicio <= data && data <= evento.fim
}

/**
 * A regra do dia. Comuns (tudo menos a Reunião extra e o encontro da Classe Bíblica): qualquer um
 * que tire, tira. A extra só acrescenta e vence a sobreposição. O encontro da Classe Bíblica não
 * entra nas contas: ele divide o dia com a reunião sem mudá-la. Férias é gravada com Terá classe =
 * sim para não derrubar o acampamento no meio dela: sem reunião e sem campo, não há classe.
 */
export function situacaoDaData(data: string, diaReuniao: number, eventos: readonly EventoDoCalendario[]): SituacaoDeData {
  const doDia = eventos.filter(cobre(data))
  const comuns = doDia.filter((evento) => evento.tipo !== 'REUNIAO_EXTRA' && evento.tipo !== 'CLASSE_BIBLICA')
  const extra = doDia.find((evento) => evento.tipo === 'REUNIAO_EXTRA') ?? null
  const reuniaoMantida = comuns.every((evento) => evento.temReuniao)
  const classeLiberada = comuns.every((evento) => evento.temClasse)
  const bomParaCampo = comuns.some((evento) => evento.bomParaCampo)
  const reuniaoDoDiaNormal = diaDaSemana(data) === diaReuniao && reuniaoMantida
  return {
    reuniaoMantida,
    classeLiberada,
    bomParaCampo,
    temReuniao: reuniaoDoDiaNormal || (extra?.temReuniao ?? false),
    temClasse: (classeLiberada && (reuniaoDoDiaNormal || bomParaCampo)) || (extra?.temClasse ?? false),
    ferias: comuns.some((evento) => evento.tipo === 'FERIAS'),
    extra: extra && { nome: extra.nome, temReuniao: extra.temReuniao, temClasse: extra.temClasse, horario: extra.horario, local: extra.local },
    eventos: doDia.map((evento) => evento.nome),
  }
}

/** Dias do período com reunião: os dias normais mantidos e as extras com Terá reunião. */
export function diasDeReuniao(inicio: string, fim: string, diaReuniao: number, eventos: readonly EventoDoCalendario[]): string[] {
  return datasDoIntervalo(inicio, fim).filter((data) => situacaoDaData(data, diaReuniao, eventos).temReuniao)
}

/** Trilha individual: datas em que cabe classe. */
export function datasDeClasse(inicio: string, fim: string, diaReuniao: number, eventos: readonly EventoDoCalendario[]): string[] {
  return datasDoIntervalo(inicio, fim).filter((data) => situacaoDaData(data, diaReuniao, eventos).temClasse)
}

/** Linhas da montagem: dias normais fora das férias (bloqueados ou não), datas boas para campo e extras com classe. */
export function datasDaMontagem(inicio: string, fim: string, diaReuniao: number, eventos: readonly EventoDoCalendario[]): string[] {
  return datasDoIntervalo(inicio, fim).filter((data) => {
    const situacao = situacaoDaData(data, diaReuniao, eventos)
    return (diaDaSemana(data) === diaReuniao && !situacao.ferias) || situacao.bomParaCampo || (situacao.extra?.temClasse ?? false)
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

/**
 * A data deixou de ser de classe para uma classe individual futura, com requisitos e sem registro.
 * Só evento que tira a classe gera conflito: data sem evento nunca é conflito.
 */
export function emConflito(entrada: EntradaEmConflito): boolean {
  const { situacaoDaData: situacao } = entrada
  const extraSegura = situacao.extra?.temClasse ?? false
  const deixouDeSerDataDeClasse = !extraSegura && (!situacao.classeLiberada || (!situacao.reuniaoMantida && !situacao.bomParaCampo))
  return (
    entrada.trilha === 'INDIVIDUAL' &&
    entrada.temRequisitos &&
    !entrada.temRegistro &&
    entrada.data >= entrada.hoje &&
    deixouDeSerDataDeClasse
  )
}

export function situacaoDaAula(entrada: { temRegistro: boolean; emConflito: boolean; data: string; hoje: string }): SituacaoAula {
  if (entrada.temRegistro) return 'DADA'
  if (entrada.emConflito) return 'CONFLITO'
  if (entrada.data === entrada.hoje) return 'HOJE'
  if (entrada.data < entrada.hoje) return 'NAO_REGISTRADA'
  return 'PLANEJADA'
}

/** Hoje inclusive. `extra` só vem quando é ela que dá a reunião do dia. */
export function proximaReuniao(
  hoje: string,
  diaReuniao: number,
  eventos: readonly EventoDoCalendario[],
  limiteEmDias = JANELA_DO_CALENDARIO_EM_DIAS,
): { data: string; extra: ExtraDaData | null } | null {
  for (let dias = 0; dias <= limiteEmDias; dias++) {
    const data = somarDias(hoje, dias)
    const situacao = situacaoDaData(data, diaReuniao, eventos)
    if (situacao.temReuniao) return { data, extra: situacao.extra?.temReuniao ? situacao.extra : null }
  }
  return null
}

/**
 * Do primeiro dia normal >= hoje: se ele não tem reunião e está em férias, o fim delas. Férias seguidas
 * se juntam enquanto nenhum dia normal COM reunião fica entre elas. Primeiro dia normal com reunião: null.
 */
export function feriasAte(
  hoje: string,
  diaReuniao: number,
  eventos: readonly EventoDoCalendario[],
  limiteEmDias = JANELA_DO_CALENDARIO_EM_DIAS,
): string | null {
  let ate: string | null = null
  for (let dias = 0; dias <= limiteEmDias; dias++) {
    const data = somarDias(hoje, dias)
    if (diaDaSemana(data) !== diaReuniao) continue
    const situacao = situacaoDaData(data, diaReuniao, eventos)
    if (situacao.temReuniao) return ate
    if (!situacao.ferias) {
      if (ate === null) return null
      continue
    }
    for (const evento of eventos.filter(cobre(data))) {
      if (evento.tipo === 'FERIAS' && (ate === null || evento.fim > ate)) ate = evento.fim
    }
  }
  return ate
}

interface HorarioELocal {
  horario: string
  local: string | null
}

/** Horário e local do dia: os da extra que dá a reunião, campo a campo; senão os do clube. */
export function horarioELocalDoDia(situacao: Pick<SituacaoDeData, 'extra'>, padrao: HorarioELocal): HorarioELocal {
  const extra = situacao.extra?.temReuniao ? situacao.extra : null
  return { horario: extra?.horario ?? padrao.horario, local: extra?.local ?? padrao.local }
}

export interface ProblemaDeEvento {
  campo: 'fim' | 'temReuniao'
  mensagem: string
}

/** Roda DEPOIS do padrão do tipo (API e formulário). "Duas extras na data" é da API, dentro da transação. */
export function validarEvento(
  entrada: Pick<EventoDoCalendario, 'tipo' | 'inicio' | 'fim' | 'temReuniao' | 'temClasse'>,
): ProblemaDeEvento[] {
  const problemas: ProblemaDeEvento[] = []
  if (entrada.fim < entrada.inicio) problemas.push({ campo: 'fim', mensagem: 'O fim não pode ser antes do início' })
  else if (entrada.tipo === 'REUNIAO_EXTRA' && entrada.fim !== entrada.inicio) {
    problemas.push({ campo: 'fim', mensagem: 'A reunião extra é de um dia só.' })
  }
  if (entrada.tipo === 'REUNIAO_EXTRA' && !entrada.temReuniao && !entrada.temClasse) {
    problemas.push({ campo: 'temReuniao', mensagem: 'Marque Terá reunião, Terá classe ou as duas.' })
  }
  return problemas
}
