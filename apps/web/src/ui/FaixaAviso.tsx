import { TriangleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

interface Propriedades {
  children: ReactNode
  className?: string
  /** Com ela, a faixa ganha o botão "Fechar aviso"; sem ela, fica fixa. */
  aoFechar?: () => void
}

/** Margens negativas: o alvo de toque tem 44 px sem engordar a faixa. */
const ESTILO_DO_FECHAR =
  '-my-2.5 -mr-3 flex size-[var(--touch-min)] shrink-0 items-center justify-center rounded-full hover:bg-black/5'

/** Faixa amarela: avisa sem impedir o que o usuário está fazendo. */
export function FaixaAviso({ children, className, aoFechar }: Propriedades) {
  return (
    <div role="status" className={cn('flex items-start gap-3 rounded-botao bg-alerta-fundo px-4 py-3 text-sm font-medium text-alerta', className)}>
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className={cn(aoFechar && 'flex-1')}>{children}</div>
      {aoFechar && (
        <button type="button" aria-label="Fechar aviso" onClick={aoFechar} className={ESTILO_DO_FECHAR}>
          <X aria-hidden className="size-5" />
        </button>
      )}
    </div>
  )
}
