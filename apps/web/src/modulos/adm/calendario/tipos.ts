import type { z } from 'zod'
import type { TipoEvento } from '@desbravadores/shared'

export type TipoDeEvento = z.infer<typeof TipoEvento>

export const ROTULOS_DO_TIPO: Record<TipoDeEvento, string> = {
  SEM_REUNIAO: 'Sem reunião',
  ACAMPAMENTO: 'Acampamento / campo',
  EVENTO: 'Evento do clube',
  FERIADO: 'Feriado',
}

/** Cores do calendário (tokens `--cal-*`): classes literais para o Tailwind enxergá-las. */
export const CORES_DO_TIPO: Record<TipoDeEvento, string> = {
  SEM_REUNIAO: 'bg-[var(--cal-sem-bg)] text-[var(--cal-sem-fg)]',
  ACAMPAMENTO: 'bg-[var(--cal-acamp-bg)] text-[var(--cal-acamp-fg)]',
  EVENTO: 'bg-[var(--cal-evento-bg)] text-[var(--cal-evento-fg)]',
  FERIADO: 'bg-[var(--cal-feriado-bg)] text-[var(--cal-feriado-fg)]',
}

export const COR_DA_REUNIAO = 'bg-[var(--cal-reuniao-bg)] text-[var(--cal-reuniao-fg)]'
