import { useId } from 'react'
import type { SelectHTMLAttributes } from 'react'
import { CampoRotulado, descreverCampo, estiloControle } from './Campo'
import { cn } from './cn'

interface Propriedades extends SelectHTMLAttributes<HTMLSelectElement> {
  rotulo: string
  ajuda?: string
  erro?: string
}

export function Selecao({ rotulo, ajuda, erro, className, id, children, ...resto }: Propriedades) {
  const gerado = useId()
  const idCampo = id ?? gerado
  return (
    <CampoRotulado rotulo={rotulo} ajuda={ajuda} erro={erro} idCampo={idCampo}>
      <select
        id={idCampo}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descreverCampo(idCampo, ajuda, erro)}
        className={cn(estiloControle, className)}
        {...resto}
      >
        {children}
      </select>
    </CampoRotulado>
  )
}
