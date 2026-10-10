import { CalendarPlus, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { z } from 'zod'
import type { TipoEvento } from '@desbravadores/shared'
import { dosDiasDeReuniao } from './datas'

export type TipoDeEvento = z.infer<typeof TipoEvento>

/** Na ordem da legenda do calendário. */
export const ROTULOS_DO_TIPO: Record<TipoDeEvento, string> = {
  REUNIAO_EXTRA: 'Reunião extra',
  FERIAS: 'Férias',
  ACAMPAMENTO: 'Acampamento / campo',
  EVENTO: 'Evento do clube',
  FERIADO: 'Feriado',
  SEM_REUNIAO: 'Sem reunião',
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
  FERIADO: 'bg-[var(--cal-feriado-bg)] text-[var(--cal-feriado-fg)]',
  CLASSE_BIBLICA: 'bg-[var(--cal-evento-bg)] text-[var(--cal-evento-fg)]',
}

export const ICONE_DO_TIPO: Partial<Record<TipoDeEvento, LucideIcon>> = {
  REUNIAO_EXTRA: CalendarPlus,
  FERIAS: Sun,
}

/** Texto de apoio sob o seletor de Tipo; `diaReuniao` ausente (configuração não carregada) cai em "dias de reunião". */
export const TEXTO_DO_TIPO: Partial<Record<TipoDeEvento, (diaReuniao: number | undefined) => string>> = {
  EVENTO: (diaReuniao) =>
    `Evento do clube: a reunião acontece e não há classe, salvo se você marcar. Para um período sem reuniões, escolha Férias; para uma reunião fora ${dosDiasDeReuniao(diaReuniao).do}, Reunião extra.`,
  FERIAS: (diaReuniao) => `Férias: sem reunião e sem classe ${dosDiasDeReuniao(diaReuniao).nos} do período; acampamentos continuam valendo.`,
  REUNIAO_EXTRA: (diaReuniao) => `Reunião extra: uma data fora ${dosDiasDeReuniao(diaReuniao).do}, com chamada da unidade, classe ou as duas.`,
}

/** Ponto do dia na grade do celular, na cor forte do tipo; a reunião extra é um anel, para não se confundir com a regular. */
export const PONTO_DA_REUNIAO = 'bg-[var(--cal-reuniao-fg)]'
export const PONTO_DO_TIPO: Record<TipoDeEvento, string> = {
  REUNIAO_EXTRA: 'border-2 border-[var(--cal-reuniao-fg)] bg-superficie',
  FERIAS: 'bg-[var(--cal-ferias-fg)]',
  SEM_REUNIAO: 'bg-[var(--cal-sem-fg)]',
  ACAMPAMENTO: 'bg-[var(--cal-acamp-fg)]',
  EVENTO: 'bg-[var(--cal-evento-fg)]',
  FERIADO: 'bg-[var(--cal-feriado-fg)]',
  CLASSE_BIBLICA: 'bg-[var(--cal-evento-fg)]',
}
