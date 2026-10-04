import type { KeyboardEvent } from 'react'
import { cn } from './cn'

export interface AbaDefinida {
  id: string
  rotulo: string
}

interface Propriedades {
  /** Nome do grupo de abas (leitor de tela). */
  rotulo: string
  abas: AbaDefinida[]
  ativa: string
  aoMudar: (id: string) => void
}

export function Abas({ rotulo, abas, ativa, aoMudar }: Propriedades) {
  const aoTeclar = (evento: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const passo = evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0
    if (passo === 0) return
    evento.preventDefault()
    const proxima = abas[(indice + passo + abas.length) % abas.length]
    aoMudar(proxima.id)
    document.getElementById(`aba-${proxima.id}`)?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={rotulo}
      className="flex max-w-full flex-wrap gap-1 rounded-botao bg-trilho p-1"
    >
      {abas.map((aba, indice) => {
        const selecionada = aba.id === ativa
        return (
          <button
            key={aba.id}
            id={`aba-${aba.id}`}
            type="button"
            role="tab"
            aria-selected={selecionada}
            tabIndex={selecionada ? 0 : -1}
            onClick={() => aoMudar(aba.id)}
            onKeyDown={(evento) => aoTeclar(evento, indice)}
            className={cn(
              'min-h-[var(--touch-min)] flex-1 whitespace-nowrap rounded-controle px-3 text-base font-semibold focus-visible:outline-2 focus-visible:outline-marca',
              selecionada
                ? 'bg-superficie text-marca shadow-[var(--shadow-segment)]'
                : 'text-texto-2',
            )}
          >
            {aba.rotulo}
          </button>
        )
      })}
    </div>
  )
}
