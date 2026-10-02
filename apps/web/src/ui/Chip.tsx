import { Check } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

interface Propriedades extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  selecionado: boolean
  /** Recebe o valor novo (o contrário do atual). */
  aoAlternar: (selecionado: boolean) => void
  /** `suave` (presença, filtros) marca com a cor clara; `cheia` (escolha de escopo) preenche e põe um ✓. */
  variante?: 'suave' | 'cheia'
}

const SELECIONADO = {
  suave: 'border-marca bg-marca-suave text-marca',
  cheia: 'border-marca bg-marca text-sobre-marca',
} as const

/** Botão liga/desliga (filtro, presença, escopo). Alvo de toque de 44 px. */
export function Chip({ selecionado, aoAlternar, variante = 'suave', className, type = 'button', children, ...resto }: Propriedades) {
  return (
    <button
      type={type}
      aria-pressed={selecionado}
      onClick={() => aoAlternar(!selecionado)}
      className={cn(
        'inline-flex min-h-[var(--touch-min)] items-center justify-center gap-1.5 rounded-full border px-4 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca',
        selecionado ? SELECIONADO[variante] : 'border-borda-controle bg-superficie text-texto hover:bg-superficie-suave',
        className,
      )}
      {...resto}
    >
      {variante === 'cheia' && selecionado && <Check aria-hidden className="size-4 shrink-0" />}
      {children}
    </button>
  )
}
