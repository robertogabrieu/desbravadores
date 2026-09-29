import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

/** Faixa amarela: avisa sem impedir o que o usuário está fazendo. */
export function FaixaAviso({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="status" className={cn('flex items-start gap-3 rounded-botao bg-alerta-fundo px-4 py-3 text-sm font-medium text-alerta', className)}>
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}
