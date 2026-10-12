import { BookOpen, CalendarDays, CalendarPlus, CalendarX, Flag, Sparkles, Sun, Tent } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { z } from 'zod'
import type { TipoEvento } from '@desbravadores/shared'
import { dosDiasDeReuniao } from './datas'

export type TipoDeEvento = z.infer<typeof TipoEvento>

/** Na ordem da legenda do calendário. */
export const ROTULOS_DO_TIPO: Record<TipoDeEvento, string> = {
  REUNIAO_EXTRA: 'Reunião extra',
  SEM_REUNIAO: 'Sem reunião',
  FERIAS: 'Férias',
  FERIADO: 'Feriado',
  EVENTO: 'Evento do clube',
  EVENTO_ESPECIAL: 'Evento especial',
  ACAMPAMENTO: 'Acampamento / campo',
  CLASSE_BIBLICA: 'Classe Bíblica',
}

export const COR_DA_REUNIAO = 'bg-[var(--cal-reuniao-bg)] text-[var(--cal-reuniao-fg)]'

/** Cores do calendário (tokens `--cal-*`): classes literais para o Tailwind enxergá-las. */
export const CORES_DO_TIPO: Record<TipoDeEvento, string> = {
  REUNIAO_EXTRA: `${COR_DA_REUNIAO} border border-dashed border-current`,
  FERIAS: 'bg-[var(--cal-ferias-bg)] text-[var(--cal-ferias-fg)]',
  SEM_REUNIAO: 'bg-[var(--cal-sem-bg)] text-[var(--cal-sem-fg)]',
  ACAMPAMENTO: 'bg-[var(--cal-acamp-bg)] text-[var(--cal-acamp-fg)]',
  EVENTO: 'bg-[var(--cal-evento-bg)] text-[var(--cal-evento-fg)]',
  EVENTO_ESPECIAL: 'bg-[var(--cal-especial-bg)] text-[var(--cal-especial-fg)]',
  FERIADO: 'bg-[var(--cal-feriado-bg)] text-[var(--cal-feriado-fg)]',
  CLASSE_BIBLICA: 'bg-[var(--cal-evento-bg)] text-[var(--cal-evento-fg)]',
}

export const ICONE_DO_TIPO: Partial<Record<TipoDeEvento, LucideIcon>> = {
  REUNIAO_EXTRA: CalendarPlus,
  FERIAS: Sun,
  EVENTO_ESPECIAL: Sparkles,
  CLASSE_BIBLICA: BookOpen,
}

/** Ícone de cada tipo na escolha e no selo do formulário; o do calendário (`ICONE_DO_TIPO`) só marca os que precisam de sinal além da cor. */
export const ICONE_DA_ESCOLHA: Record<TipoDeEvento, LucideIcon> = {
  REUNIAO_EXTRA: CalendarPlus,
  FERIAS: Sun,
  ACAMPAMENTO: Tent,
  EVENTO: CalendarDays,
  EVENTO_ESPECIAL: Sparkles,
  FERIADO: Flag,
  SEM_REUNIAO: CalendarX,
  CLASSE_BIBLICA: BookOpen,
}

/** Texto de apoio sob o seletor de Tipo; `diaReuniao` ausente (configuração não carregada) cai em "dias de reunião". */
export const TEXTO_DO_TIPO: Partial<Record<TipoDeEvento, (diaReuniao: number | undefined) => string>> = {
  EVENTO: () =>
    'Evento do clube: só marca a data no calendário; não vale pontos nem tem lista de quem foi.',
  EVENTO_ESPECIAL: () =>
    'Evento especial: vale pontos no ranking, tem lista de quem foi e pede uniforme de gala ou de campo. A reunião e a classe do dia continuam, salvo se você desmarcar abaixo.',
  FERIAS: (diaReuniao) => `Férias: sem reunião e sem classe ${dosDiasDeReuniao(diaReuniao).nos} do período; acampamentos continuam valendo.`,
  REUNIAO_EXTRA: (diaReuniao) => `Reunião extra: uma data fora ${dosDiasDeReuniao(diaReuniao).do}, com chamada da unidade, classe ou as duas.`,
  ACAMPAMENTO: () => 'Acampamento: um ou mais dias fora da sede, sem reunião; a classe só acontece como atividade de campo.',
  FERIADO: () => 'Feriado: marca a data no calendário; a reunião e a classe do dia continuam, salvo se você desmarcar abaixo.',
  SEM_REUNIAO: () => 'Sem reunião: o clube não se reúne nesses dias e não há classe nem atividade de campo.',
}

/** Ponto do dia na grade do celular, na cor forte do tipo; a reunião extra é um anel, para não se confundir com a regular. */
export const PONTO_DA_REUNIAO = 'bg-[var(--cal-reuniao-fg)]'
export const PONTO_DO_TIPO: Record<TipoDeEvento, string> = {
  REUNIAO_EXTRA: 'border-2 border-[var(--cal-reuniao-fg)] bg-superficie',
  FERIAS: 'bg-[var(--cal-ferias-fg)]',
  SEM_REUNIAO: 'bg-[var(--cal-sem-fg)]',
  ACAMPAMENTO: 'bg-[var(--cal-acamp-fg)]',
  EVENTO: 'bg-[var(--cal-evento-fg)]',
  EVENTO_ESPECIAL: 'bg-[var(--cal-especial-fg)]',
  FERIADO: 'bg-[var(--cal-feriado-fg)]',
  CLASSE_BIBLICA: 'bg-[var(--cal-evento-fg)]',
}

/** O encontro cancelado da Classe Bíblica, no cartão e na ficha. */
export const textoDoCancelamento = (motivo: string | null): string => (motivo ? `Cancelado: ${motivo}` : 'Cancelado')
