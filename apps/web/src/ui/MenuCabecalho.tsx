import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

export interface ItemMenu {
  rotulo: string
  aoEscolher: () => void
}

interface Propriedades {
  /** Texto do botão (o nome do usuário). */
  rotulo: string
  itens: ItemMenu[]
}

export function MenuCabecalho({ rotulo, itens }: Propriedades) {
  const [aberto, definirAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const idMenu = useId()

  useEffect(() => {
    if (!aberto) return
    const aoClicarFora = (evento: MouseEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) definirAberto(false)
    }
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') definirAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={idMenu}
        onClick={() => definirAberto(!aberto)}
        className="flex min-h-[var(--touch-min)] items-center gap-1.5 rounded-botao px-3 text-base font-semibold hover:bg-black/5"
      >
        {/* Nome comprido não quebra o cabeçalho do celular em duas linhas. */}
        <span className="max-w-[40vw] truncate sm:max-w-xs">{rotulo}</span>
        <ChevronDown aria-hidden className="size-4" />
      </button>
      {aberto && (
        <div id={idMenu} role="menu" className="absolute right-0 z-40 mt-1 min-w-56 rounded-cartao border border-borda bg-superficie py-1 text-texto shadow-lg">
          {itens.map((item) => (
            <button
              key={item.rotulo}
              type="button"
              role="menuitem"
              onClick={() => {
                definirAberto(false)
                item.aoEscolher()
              }}
              className="flex min-h-[var(--touch-min)] w-full items-center px-4 text-left text-base hover:bg-superficie-suave"
            >
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
