import type { ReactNode } from 'react'
import { cn } from './cn'

export interface Par {
  rotulo: string
  valor: ReactNode
}

export function ListaDePares({ pares, colunas = 2 }: { pares: Par[]; colunas?: 2 | 3 }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-4', colunas === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2')}>
      {pares.map((par) => (
        <div key={par.rotulo} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-sm text-texto-2">{par.rotulo}</dt>
          <dd className="text-base font-semibold break-words text-texto">{par.valor}</dd>
        </div>
      ))}
    </dl>
  )
}
