import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

interface Propriedades extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  selecionado: boolean
  /** Recebe o valor novo (o contrário do atual). */
  aoAlternar: (selecionado: boolean) => void
}

/** Botão liga/desliga (filtro, presença). Alvo de toque de 44 px. */
export function Chip({ selecionado, aoAlternar, className, type = 'button', ...resto }: Propriedades) {
  return (
    <button
      type={type}
      aria-pressed={selecionado}
      onClick={() => aoAlternar(!selecionado)}
      className={cn(
        'inline-flex min-h-[var(--touch-min)] items-center justify-center rounded-full border px-4 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca',
        selecionado ? 'border-marca bg-marca-suave text-marca' : 'border-borda bg-superficie text-texto hover:bg-superficie-suave',
        className,
      )}
      {...resto}
    />
  )
}
