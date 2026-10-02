import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { TouchEvent } from 'react'
import type { DetalheAlbum } from '../../api/fotos'
import { Botao } from '../../ui/Botao'

type Foto = DetalheAlbum['fotos'][number]

/** Deslocamento mínimo, em pixels, para o gesto contar como deslizar. */
const LIMITE_DO_GESTO = 50

interface Propriedades {
  fotos: Foto[]
  indice: number
  aoMudar: (indice: number) => void
  aoFechar: () => void
  aoRemover: (foto: Foto) => void
}

/** Foto em tela cheia (sem zoom): deslizar ou tocar nas setas troca de foto; Esc fecha. */
export function FotoCheia({ fotos, indice, aoMudar, aoFechar, aoRemover }: Propriedades) {
  const inicioDoToque = useRef<number | null>(null)
  const dialogo = useRef<HTMLDivElement>(null)
  const foto = fotos[indice]
  const anterior = indice > 0
  const proxima = indice < fotos.length - 1

  useEffect(() => {
    const quemAbriu = document.activeElement
    dialogo.current?.focus()
    return () => {
      if (quemAbriu instanceof HTMLElement && quemAbriu.isConnected) quemAbriu.focus()
    }
  }, [])

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar()
      if (evento.key === 'ArrowLeft' && indice > 0) aoMudar(indice - 1)
      if (evento.key === 'ArrowRight' && indice < fotos.length - 1) aoMudar(indice + 1)
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [indice, fotos.length, aoMudar, aoFechar])

  if (!foto) return null

  const aoTocar = (evento: TouchEvent) => {
    inicioDoToque.current = evento.touches[0]?.clientX ?? null
  }
  const aoSoltar = (evento: TouchEvent) => {
    const inicio = inicioDoToque.current
    const fim = evento.changedTouches[0]?.clientX
    inicioDoToque.current = null
    if (inicio === null || fim === undefined) return
    const deslocamento = fim - inicio
    if (deslocamento <= -LIMITE_DO_GESTO && proxima) aoMudar(indice + 1)
    if (deslocamento >= LIMITE_DO_GESTO && anterior) aoMudar(indice - 1)
  }

  return (
    <div ref={dialogo} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Foto ${indice + 1} de ${fotos.length}`} className="fixed inset-0 z-40 flex flex-col bg-black text-white outline-none">
      <div className="flex items-center justify-between p-3">
        <span className="text-base font-semibold">
          {indice + 1} / {fotos.length}
        </span>
        <button type="button" aria-label="Fechar" onClick={aoFechar} className="flex size-[var(--touch-min)] items-center justify-center rounded-botao hover:bg-white/10">
          <X aria-hidden className="size-6" />
        </button>
      </div>
      <div data-testid="area-da-foto" onTouchStart={aoTocar} onTouchEnd={aoSoltar} className="relative flex min-h-0 flex-1 items-center justify-center">
        <img src={foto.url} alt={foto.legenda ?? `Foto ${indice + 1}`} className="max-h-full max-w-full object-contain" />
        {anterior && (
          <button type="button" aria-label="Foto anterior" onClick={() => aoMudar(indice - 1)} className="absolute left-2 flex size-[var(--touch-min)] items-center justify-center rounded-full bg-black/50">
            <ChevronLeft aria-hidden className="size-6" />
          </button>
        )}
        {proxima && (
          <button type="button" aria-label="Próxima foto" onClick={() => aoMudar(indice + 1)} className="absolute right-2 flex size-[var(--touch-min)] items-center justify-center rounded-full bg-black/50">
            <ChevronRight aria-hidden className="size-6" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4">
        {foto.legenda && <p className="text-base">{foto.legenda}</p>}
        <p className="text-sm text-white/80">Enviada por {foto.enviadaPor}</p>
        {foto.podeRemover && (
          <Botao variante="perigo" onClick={() => aoRemover(foto)}>
            Remover
          </Botao>
        )}
      </div>
    </div>
  )
}
