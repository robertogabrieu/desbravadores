import type { AgendaPublicaSaida } from '@desbravadores/shared'

export type Compromisso = AgendaPublicaSaida['compromissos'][number]
type Tipo = Compromisso['tipo']

/** Como o dia aparece no calendário: a cor e a abreviação escrita (a cor sozinha nunca diz o tipo). */
export type Familia = 'reuniao' | 'acamp' | 'evento' | 'sem'

const FAMILIA_DO_TIPO: Record<Exclude<Tipo, 'CLASSE_BIBLICA'>, Familia> = {
  REUNIAO: 'reuniao',
  REUNIAO_EXTRA: 'reuniao',
  ACAMPAMENTO: 'acamp',
  EVENTO: 'evento',
  EVENTO_ESPECIAL: 'evento',
  SEM_REUNIAO: 'sem',
  FERIADO: 'sem',
  FERIAS: 'sem',
}

const ABREVIACAO_DO_TIPO: Record<Exclude<Tipo, 'CLASSE_BIBLICA'>, string> = {
  REUNIAO: 'Reun.',
  REUNIAO_EXTRA: 'Extra',
  ACAMPAMENTO: 'Acamp.',
  EVENTO: 'Evento',
  EVENTO_ESPECIAL: 'Evento',
  SEM_REUNIAO: 'Sem',
  FERIADO: 'Sem',
  FERIAS: 'Sem',
}

const ROTULO_DO_TIPO: Record<Exclude<Tipo, 'CLASSE_BIBLICA'>, string> = {
  REUNIAO: 'Reunião',
  REUNIAO_EXTRA: 'Reunião extra',
  ACAMPAMENTO: 'Acampamento',
  EVENTO: 'Evento',
  EVENTO_ESPECIAL: 'Evento especial',
  SEM_REUNIAO: 'Sem reunião',
  FERIADO: 'Sem reunião',
  FERIAS: 'Sem reunião',
}

/** A Classe Bíblica nunca chega da API; se chegasse, a página a trataria como reunião a esconder. */
const tipoVisivel = (tipo: Tipo): Exclude<Tipo, 'CLASSE_BIBLICA'> => (tipo === 'CLASSE_BIBLICA' ? 'REUNIAO' : tipo)

export const familiaDoCompromisso = (c: Compromisso): Familia => FAMILIA_DO_TIPO[tipoVisivel(c.tipo)]
export const abreviacaoDoCompromisso = (c: Compromisso): string => ABREVIACAO_DO_TIPO[tipoVisivel(c.tipo)]
export const rotuloDoCompromisso = (c: Compromisso): string => ROTULO_DO_TIPO[tipoVisivel(c.tipo)]

/** Feriado, Férias e Sem reunião: avisos, sem horário, local nem uniforme. */
export const ehAviso = (c: Compromisso): boolean => familiaDoCompromisso(c) === 'sem'

export const fimDoCompromisso = (c: Compromisso): string => c.fim ?? c.data

/** Por data e, no mesmo dia, pelo horário (sem horário por último). */
export const porData = (a: Compromisso, b: Compromisso): number =>
  a.data.localeCompare(b.data) || (a.horario ?? '99:99').localeCompare(b.horario ?? '99:99')

/** O que ainda não terminou hoje, em ordem de data. */
export const aPartirDeHoje = (compromissos: Compromisso[], hoje: string): Compromisso[] =>
  compromissos.filter((c) => fimDoCompromisso(c) >= hoje).sort(porData)

/** O de menor data que é encontro (aviso de "Sem reunião" não é compromisso). */
export const proximoCompromisso = (futuros: Compromisso[]): Compromisso | undefined => futuros.find((c) => !ehAviso(c))

/** Compromisso que cobre o dia; encontro vale mais que aviso, e a ordem de data decide o resto. */
export function compromissoDoDia(compromissos: Compromisso[], data: string): Compromisso | undefined {
  const doDia = compromissos.filter((c) => c.data <= data && data <= fimDoCompromisso(c)).sort(porData)
  return doDia.find((c) => !ehAviso(c)) ?? doDia[0]
}

/** "2026-10-13" + 120 → "2027-02-10". */
export function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10)
}

export interface MesDoCalendario {
  ano: number
  /** 0 a 11 */
  mes: number
}

/** Do mês de hoje ao mês do último dia da janela, inclusive. */
export function mesesDaJanela(hoje: string, ultimoDia: string): MesDoCalendario[] {
  const meses: MesDoCalendario[] = []
  let ano = Number(hoje.slice(0, 4))
  let mes = Number(hoje.slice(5, 7)) - 1
  const anoFinal = Number(ultimoDia.slice(0, 4))
  const mesFinal = Number(ultimoDia.slice(5, 7)) - 1
  while (ano < anoFinal || (ano === anoFinal && mes <= mesFinal)) {
    meses.push({ ano, mes })
    mes += 1
    if (mes === 12) {
      mes = 0
      ano += 1
    }
  }
  return meses
}

export function iniciaisDoClube(nome: string): string {
  const palavras = nome.split(/\s+/).filter((palavra) => palavra.length > 2)
  return palavras
    .slice(0, 2)
    .map((palavra) => palavra.charAt(0).toUpperCase())
    .join('')
}
