import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as EventoTeclado } from 'react'
import { cn } from './cn'

export interface ItemMenu {
  rotulo: string
  aoEscolher: () => void
  /** Linha menor abaixo do rótulo (ex.: o escopo de um papel). */
  descricao?: string
  /** Em menu de escolha única: o item em uso ganha ✓ e `aria-checked`. */
  marcado?: boolean
}

interface Propriedades {
  /** Texto do botão (o nome do usuário, o papel em uso). */
  rotulo: string
  itens: ItemMenu[]
  /** Nome do botão para o leitor de tela, quando o texto visível não basta. */
  rotuloAcessivel?: string
  className?: string
  classeDoBotao?: string
  classeDoRotulo?: string
}

const ITENS = '[role^="menuitem"]'
const MARGEM_DA_TELA = 8

/**
 * Botão do cabeçalho que abre um menu curto. Teclado: abrir leva o foco ao item marcado (ou ao
 * primeiro), setas e Home/End andam, Esc e escolher devolvem o foco ao botão, Tab fecha.
 */
export function MenuCabecalho({ rotulo, itens, rotuloAcessivel, className, classeDoBotao, classeDoRotulo }: Propriedades) {
  const [aberto, definirAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const idMenu = useId()
  const escolhaUnica = itens.some((item) => item.marcado !== undefined)
  const [deslocamento, definirDeslocamento] = useState(0)

  // O menu se alinha pela direita do botão; botão perto da esquerda (selo no cabeçalho de 320 px) o empurraria para fora da tela.
  useLayoutEffect(() => {
    if (!aberto || !menu.current) return
    const esquerda = menu.current.getBoundingClientRect().left
    definirDeslocamento(esquerda < MARGEM_DA_TELA ? MARGEM_DA_TELA - esquerda : 0)
    return () => definirDeslocamento(0)
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    const marcado = menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    ;(marcado ?? menu.current?.querySelector<HTMLElement>(ITENS))?.focus()

    const aoClicarFora = (evento: MouseEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) definirAberto(false)
    }
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return
      definirAberto(false)
      botao.current?.focus()
    }
    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  const andarComTeclado = (evento: EventoTeclado<HTMLDivElement>) => {
    if (evento.key === 'Tab') {
      definirAberto(false)
      return
    }
    const itensDoMenu = [...(menu.current?.querySelectorAll<HTMLElement>(ITENS) ?? [])]
    const atual = itensDoMenu.findIndex((item) => item === document.activeElement)
    const destinos: Partial<Record<string, number>> = {
      ArrowDown: (atual + 1) % itensDoMenu.length,
      ArrowUp: (atual - 1 + itensDoMenu.length) % itensDoMenu.length,
      Home: 0,
      End: itensDoMenu.length - 1,
    }
    const destino = destinos[evento.key]
    if (destino === undefined) return
    evento.preventDefault()
    itensDoMenu[destino]?.focus()
  }

  return (
    // min-w-12: num cabeçalho apertado o rótulo encolhe até sumir, mas a seta e a área de toque ficam.
    <div ref={raiz} className={cn('relative min-w-12', className)}>
      <button
        ref={botao}
        type="button"
        aria-label={rotuloAcessivel}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        onClick={() => definirAberto(!aberto)}
        className={cn('flex min-h-[var(--touch-min)] max-w-full items-center gap-1.5 rounded-botao px-3 text-base font-semibold hover:bg-black/5', classeDoBotao)}
      >
        {/* Nome comprido não quebra o cabeçalho do celular em duas linhas. */}
        <span className={cn('max-w-[40vw] truncate sm:max-w-xs', classeDoRotulo)}>{rotulo}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0" />
      </button>
      {aberto && (
        <div
          ref={menu}
          id={idMenu}
          role="menu"
          onKeyDown={andarComTeclado}
          style={deslocamento ? { transform: `translateX(${deslocamento}px)` } : undefined}
          className="absolute right-0 z-40 mt-1 w-max max-w-[calc(100vw-1rem)] min-w-56 rounded-cartao border border-borda-controle bg-superficie py-1 text-texto shadow-lg"
        >
          {itens.map((item) => (
            <button
              key={item.rotulo}
              type="button"
              role={escolhaUnica ? 'menuitemradio' : 'menuitem'}
              aria-checked={escolhaUnica ? item.marcado === true : undefined}
              tabIndex={-1}
              onClick={() => {
                definirAberto(false)
                botao.current?.focus()
                item.aoEscolher()
              }}
              className="flex min-h-[var(--touch-min)] w-full items-center gap-3 px-4 py-2 text-left text-base hover:bg-superficie-suave focus-visible:bg-superficie-suave focus-visible:outline-none"
            >
              {escolhaUnica && <Check aria-hidden className={cn('size-5 shrink-0 text-marca', !item.marcado && 'invisible')} />}
              <span className="flex min-w-0 flex-col">
                <span className={cn(item.marcado && 'font-semibold')}>{item.rotulo}</span>
                {item.descricao && <span className="text-sm text-texto-2">{item.descricao}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
