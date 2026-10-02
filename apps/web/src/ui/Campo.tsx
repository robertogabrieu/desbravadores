import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export const estiloControle =
  'min-h-[var(--touch-min)] w-full rounded-controle border border-borda-controle bg-superficie px-3.5 text-base text-texto placeholder:text-texto-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-marca disabled:bg-superficie-suave aria-[invalid=true]:border-perigo'

interface PropriedadesRotulo {
  rotulo: string
  ajuda?: string
  erro?: string
  idCampo: string
  children: ReactNode
}

/** Rótulo, ajuda e erro ao redor de um controle; compartilhado por Campo e Selecao. */
export function CampoRotulado({ rotulo, ajuda, erro, idCampo, children }: PropriedadesRotulo) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={idCampo} className="text-sm font-semibold text-texto">
        {rotulo}
      </label>
      {children}
      {ajuda && (
        <p id={`${idCampo}-ajuda`} className="text-sm text-texto-2">
          {ajuda}
        </p>
      )}
      {erro && (
        <p id={`${idCampo}-erro`} role="alert" className="text-sm font-medium text-perigo">
          {erro}
        </p>
      )}
    </div>
  )
}

export const descreverCampo = (idCampo: string, ajuda?: string, erro?: string): string | undefined =>
  [erro && `${idCampo}-erro`, ajuda && `${idCampo}-ajuda`].filter(Boolean).join(' ') || undefined

interface Propriedades extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string
  ajuda?: string
  erro?: string
  /** Unidade escrita ao lado do campo ("%", "km"): o campo curto não precisa repeti-la no valor. */
  sufixo?: string
}

export function Campo({ rotulo, ajuda, erro, sufixo, className, id, ...resto }: Propriedades) {
  const gerado = useId()
  const idCampo = id ?? gerado
  const controle = (
    <input
      id={idCampo}
      aria-invalid={erro ? true : undefined}
      aria-describedby={descreverCampo(idCampo, ajuda, erro)}
      className={cn(estiloControle, className)}
      {...resto}
    />
  )
  return (
    <CampoRotulado rotulo={rotulo} ajuda={ajuda} erro={erro} idCampo={idCampo}>
      {sufixo ? (
        <div className="flex items-center gap-2">
          {controle}
          <span aria-hidden className="text-base font-semibold text-texto-2">
            {sufixo}
          </span>
        </div>
      ) : (
        controle
      )}
    </CampoRotulado>
  )
}
