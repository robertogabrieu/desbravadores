import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

export const estiloDoBotao = cva(
  'inline-flex min-h-[var(--touch-min)] items-center justify-center gap-2 rounded-botao px-5 text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variante: {
        primario: 'bg-marca text-white hover:bg-marca-escura',
        secundario: 'border border-borda bg-superficie text-texto hover:bg-superficie-suave',
        perigo: 'bg-perigo text-white hover:opacity-90',
        texto: 'text-marca hover:bg-marca-suave',
      },
      largura: { auto: '', total: 'w-full' },
    },
    defaultVariants: { variante: 'primario', largura: 'auto' },
  },
)

interface Propriedades extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof estiloDoBotao> {
  carregando?: boolean
}

export function Botao({ variante, largura, carregando = false, disabled, className, children, type = 'button', ...resto }: Propriedades) {
  return (
    <button type={type} disabled={disabled || carregando} className={cn(estiloDoBotao({ variante, largura }), className)} {...resto}>
      {carregando && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  )
}
