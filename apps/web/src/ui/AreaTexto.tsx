import { useId } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import { CampoRotulado, descreverCampo, estiloControle } from './Campo'
import { cn } from './cn'

interface Propriedades extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  rotulo: string
  ajuda?: string
  erro?: string
}

/** Texto de várias linhas, com rótulo, ajuda e erro iguais aos do `Campo`. */
export function AreaTexto({ rotulo, ajuda, erro, className, id, rows = 4, ...resto }: Propriedades) {
  const gerado = useId()
  const idCampo = id ?? gerado
  return (
    <CampoRotulado rotulo={rotulo} ajuda={ajuda} erro={erro} idCampo={idCampo}>
      <textarea
        id={idCampo}
        rows={rows}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descreverCampo(idCampo, ajuda, erro)}
        className={cn(estiloControle, 'resize-y py-2.5', className)}
        {...resto}
      />
    </CampoRotulado>
  )
}
