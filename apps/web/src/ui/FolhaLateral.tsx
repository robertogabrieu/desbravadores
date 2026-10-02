import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

interface Propriedades {
  aberta: boolean
  titulo: string
  aoFechar: () => void
  children: ReactNode
}

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Mantém o Tab dentro do painel: do último volta ao primeiro, e do primeiro (ou do painel) vai ao último. */
function prenderTab(evento: KeyboardEvent, painel: HTMLElement) {
  const focaveis = [...painel.querySelectorAll<HTMLElement>(FOCAVEIS)]
  const primeiro = focaveis[0]
  const ultimo = focaveis[focaveis.length - 1]
  if (!primeiro || !ultimo) {
    evento.preventDefault()
    return
  }
  const atual = document.activeElement
  const foraDoPainel = !(atual instanceof Node) || !painel.contains(atual)
  if (evento.shiftKey && (atual === primeiro || atual === painel || foraDoPainel)) {
    evento.preventDefault()
    ultimo.focus()
  } else if (!evento.shiftKey && (atual === ultimo || foraDoPainel)) {
    evento.preventDefault()
    primeiro.focus()
  }
}

/** Painel que entra pela direita (tela cheia no celular): usado para Novo/Editar. */
export function FolhaLateral({ aberta, titulo, aoFechar, children }: Propriedades) {
  const idTitulo = useId()
  const painel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberta) return
    const quemAbriu = document.activeElement
    painel.current?.focus()
    return () => {
      if (quemAbriu instanceof HTMLElement && quemAbriu.isConnected) quemAbriu.focus()
    }
  }, [aberta])

  useEffect(() => {
    if (!aberta) return
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar()
      if (evento.key === 'Tab' && painel.current) prenderTab(evento, painel.current)
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
