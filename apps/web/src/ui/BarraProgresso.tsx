import { cn } from './cn'

const LISTRAS =
  'bg-[repeating-linear-gradient(135deg,var(--color-marca),var(--color-marca)_6px,var(--color-marca-suave)_6px,var(--color-marca-suave)_10px)]'

interface Propriedades {
  /** 0 a 100; fora disso é limitado. */
  valor: number
  /** O que está sendo medido (lido por leitor de tela). */
  rotulo: string
  /** Preenchimento listrado: distingue uma barra da outra sem depender da cor. */
  listrada?: boolean
  className?: string
}

export function BarraProgresso({ valor, rotulo, listrada = false, className }: Propriedades) {
  const limitado = Math.min(100, Math.max(0, Math.round(valor)))
  return (
    <div role="progressbar" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={limitado} className={cn('h-1.5 overflow-hidden rounded-full bg-marca-suave', className)}>
      <div className={cn('h-full rounded-full bg-marca transition-[width]', listrada && LISTRAS)} style={{ width: `${limitado}%` }} />
    </div>
  )
}
