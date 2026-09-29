import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'

interface Propriedades extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  rotulo: string
}

/** A linha inteira é o alvo de toque (≥ 44 px), não só o quadrado. */
export function CaixaMarcacao({ rotulo, className, id, ...resto }: Propriedades) {
  const gerado = useId()
  const idCampo = id ?? gerado
  return (
    <label htmlFor={idCampo} className={cn('flex min-h-[var(--touch-min)] cursor-pointer items-center gap-3 text-base text-texto', className)}>
      <input id={idCampo} type="checkbox" className="size-5 shrink-0 accent-marca" {...resto} />
      {rotulo}
    </label>
  )
}
