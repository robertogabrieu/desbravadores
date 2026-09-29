import { cn } from './cn'

interface Propriedades {
  /** 0 a 100; fora disso é limitado. */
  valor: number
  /** O que está sendo medido (lido por leitor de tela). */
  rotulo: string
  className?: string
}

export function BarraProgresso({ valor, rotulo, className }: Propriedades) {
  const limitado = Math.min(100, Math.max(0, Math.round(valor)))
  return (
    <div role="progressbar" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={limitado} className={cn('h-1.5 overflow-hidden rounded-full bg-marca-suave', className)}>
      <div className="h-full rounded-full bg-marca transition-[width]" style={{ width: `${limitado}%` }} />
    </div>
  )
}
