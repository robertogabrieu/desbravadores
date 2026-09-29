import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

interface Propriedades {
  aberta: boolean
  titulo: string
  aoFechar: () => void
  children: ReactNode
}

/** Painel que entra pela direita (tela cheia no celular): usado para Novo/Editar. */
export function FolhaLateral({ aberta, titulo, aoFechar, children }: Propriedades) {
  const idTitulo = useId()
  const painel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberta) return
    painel.current?.focus()
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberta, aoFechar])

  if (!aberta) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div data-testid="fundo-da-folha" className="absolute inset-0 bg-texto/40" onClick={aoFechar} />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="relative flex h-full w-full flex-col bg-superficie shadow-xl outline-none sm:max-w-md sm:rounded-l-folha"
      >
        <header className="flex items-center justify-between border-b border-divisor px-5 py-3">
          <h2 id={idTitulo} className="text-xl font-bold">
            {titulo}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={aoFechar}
            className="flex size-[var(--touch-min)] items-center justify-center rounded-full text-texto-2 hover:bg-superficie-suave"
          >
            <X aria-hidden className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
