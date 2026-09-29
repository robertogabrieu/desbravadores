import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export type TomDoSelo = 'neutro' | 'alerta' | 'sucesso' | 'perigo'

const TONS: Record<TomDoSelo, string> = {
  neutro: 'bg-marca-suave text-marca',
  alerta: 'bg-alerta-fundo text-alerta',
  sucesso: 'bg-marca-suave text-sucesso',
  perigo: 'bg-perigo text-white',
}

interface Propriedades extends HTMLAttributes<HTMLSpanElement> {
  tom?: TomDoSelo
}

/** Etiqueta curta e arredondada: contagem ou estado. */
export function Selo({ tom = 'neutro', className, ...resto }: Propriedades) {
  return <span data-tom={tom} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold', TONS[tom], className)} {...resto} />
}
