import { Shirt } from 'lucide-react'
import type { EventoCalendario } from '../../../api/calendario'
import { cn } from '../../../ui/cn'

export type UniformeDeEvento = NonNullable<EventoCalendario['uniforme']>

export const ROTULO_DO_UNIFORME: Record<UniformeDeEvento, string> = {
  GALA: 'Uniforme de gala',
  CAMPO: 'Uniforme de campo',
}

/** Escrito, com camisa e contorno (cheio na gala, tracejado no campo), em cor neutra: o uniforme nunca depende da cor. */
export function UniformeDoEvento({ uniforme, className }: { uniforme: UniformeDeEvento; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full border-2 border-borda-controle bg-superficie px-2 py-0.5 text-sm font-semibold text-texto',
        uniforme === 'GALA' ? 'border-solid' : 'border-dashed',
        className,
      )}
    >
      <Shirt aria-hidden className="size-3.5 shrink-0" />
      <span>{ROTULO_DO_UNIFORME[uniforme]}</span>
    </span>
  )
}
