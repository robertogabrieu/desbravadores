import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import { cn } from './cn'
import { useMenuSuspenso } from './useMenuSuspenso'

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
  /** Linha de texto no topo do menu aberto, acima dos itens (ex.: o nome inteiro quando o botão mostra só o primeiro). */
  cabecalho?: string
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
export function MenuCabecalho({ rotulo, itens, rotuloAcessivel, cabecalho, className, classeDoBotao, classeDoRotulo }: Propriedades) {
  const [aberto, definirAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const idMenu = useId()
  // O nome inteiro dá nome ao menu: há leitor de tela que pula o que não é item dentro dele.
  const idCabecalho = useId()
  const escolhaUnica = itens.some((item) => item.marcado !== undefined)
  const [deslocamento, definirDeslocamento] = useState(0)
  const fechar = useCallback(() => definirAberto(false), [])

  // O menu se alinha pela direita do botão; botão perto da esquerda (selo no cabeçalho de 320 px) o empurraria para fora da tela.
  useLayoutEffect(() => {
    if (!aberto || !menu.current) return
    const esquerda = menu.current.getBoundingClientRect().left
    definirDeslocamento(esquerda < MARGEM_DA_TELA ? MARGEM_DA_TELA - esquerda : 0)
    return () => definirDeslocamento(0)
  }, [aberto])

  const andarComTeclado = useMenuSuspenso({
    aberto,
    aoFechar: fechar,
    raiz,
    botao,
    menu,
    seletorDosItens: ITENS,
    focoInicial: () => menu.current?.querySelector<HTMLElement>('[aria-checked="true"]'),
  })

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
          aria-labelledby={cabecalho ? idCabecalho : undefined}
          onKeyDown={andarComTeclado}
          style={deslocamento ? { transform: `translateX(${deslocamento}px)` } : undefined}
          className="absolute right-0 z-40 mt-1 w-max max-w-[calc(100vw-1rem)] min-w-56 rounded-cartao border border-borda-controle bg-superficie py-1 text-texto shadow-lg"
        >
          {cabecalho && (
            <div id={idCabecalho} role="presentation" className="border-b border-borda px-4 pt-2 pb-3 text-base font-semibold break-words">
              {cabecalho}
            </div>
          )}
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
