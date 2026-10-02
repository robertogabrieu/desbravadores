import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface DestinoDoVoltar {
  para: string
  rotulo: string
  estado?: object
}

interface Propriedades {
  voltar: DestinoDoVoltar
  sobretitulo?: string
  titulo: string
  apoio?: ReactNode
  acoes?: ReactNode
}

export function CabecalhoDaPagina({ voltar, sobretitulo, titulo, apoio, acoes }: Propriedades) {
  return (
    <header className="flex flex-col gap-3">
      <Link
        to={voltar.para}
        state={voltar.estado}
        aria-label={`Voltar para ${voltar.rotulo}`}
        className="inline-flex min-h-[var(--touch-min)] w-fit items-center gap-2 text-base font-semibold text-marca focus-visible:outline-2 focus-visible:outline-marca"
      >
        <ArrowLeft aria-hidden className="size-5" />
        {voltar.rotulo}
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          {sobretitulo && <p className="text-sm font-semibold text-texto-2">{sobretitulo}</p>}
          <h1 className="font-titulo text-2xl font-extrabold break-words text-texto">{titulo}</h1>
          {apoio && <div className="flex flex-wrap items-center gap-2 text-base text-texto-2">{apoio}</div>}
        </div>
        {acoes && <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">{acoes}</div>}
      </div>
    </header>
  )
}
