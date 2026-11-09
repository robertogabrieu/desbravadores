import { Ellipsis } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as EventoTeclado } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../ui/cn'

export interface AcaoDoMenu {
  rotulo: string
  /** Ação que navega: vira link em vez de botão. */
  para?: string
  aoEscolher?: () => void
  desligada?: boolean
  /** Ação destrutiva: texto vermelho e separada das demais. */
  perigo?: boolean
}

interface Propriedades {
  /** Nome do botão para o leitor de tela, ex.: "Ações do pedido nº 7". */
  rotuloAcessivel: string
  acoes: AcaoDoMenu[]
}

const ITENS = '[role="menuitem"]:not(:disabled)'
const MARGEM_DA_TELA = 8
const AFASTAMENTO = 4

interface Posicao {
  top: number
  left: number
}

const CLASSE_DO_ITEM = 'flex min-h-[var(--touch-min)] w-full items-center px-4 py-2 text-left text-base hover:bg-superficie-suave focus-visible:bg-superficie-suave focus-visible:outline-none disabled:text-texto-2 disabled:hover:bg-transparent'

/**
 * Botão de reticências que abre a lista de ações de uma linha. O menu usa posição fixa para não ser cortado pela
 * rolagem da tabela: abre para baixo e alinhado à direita do botão, e vai para cima quando embaixo não cabe.
 * Teclado: abrir leva ao primeiro item, setas e Home/End andam, Esc devolve o foco ao botão, Tab fecha.
 */
export function MenuDeAcoes({ rotuloAcessivel, acoes }: Propriedades) {
  const [aberto, definirAberto] = useState(false)
  const [posicao, definirPosicao] = useState<Posicao | null>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const idMenu = useId()

  useLayoutEffect(() => {
    if (!aberto || !botao.current || !menu.current) return
    const alvo = botao.current.getBoundingClientRect()
    const { width, height } = menu.current.getBoundingClientRect()
    const cabeEmbaixo = alvo.bottom + AFASTAMENTO + height <= window.innerHeight - MARGEM_DA_TELA
    const top = cabeEmbaixo ? alvo.bottom + AFASTAMENTO : Math.max(MARGEM_DA_TELA, alvo.top - AFASTAMENTO - height)
    const left = Math.max(MARGEM_DA_TELA, Math.min(alvo.right - width, window.innerWidth - width - MARGEM_DA_TELA))
    definirPosicao({ top, left })
    return () => definirPosicao(null)
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    menu.current?.querySelector<HTMLElement>(ITENS)?.focus()

    const aoClicarFora = (evento: MouseEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) definirAberto(false)
    }
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return
      definirAberto(false)
      botao.current?.focus()
    }
    // A posição é fixa na janela: rolar ou redimensionar a deixaria solta do botão.
    const fechar = () => definirAberto(false)
    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoTeclar)
    window.addEventListener('scroll', fechar, true)
    window.addEventListener('resize', fechar)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoTeclar)
      window.removeEventListener('scroll', fechar, true)
      window.removeEventListener('resize', fechar)
    }
  }, [aberto])

  const andarComTeclado = (evento: EventoTeclado<HTMLDivElement>) => {
    if (evento.key === 'Tab') {
      definirAberto(false)
      return
    }
    const itens = [...(menu.current?.querySelectorAll<HTMLElement>(ITENS) ?? [])]
    const atual = itens.findIndex((item) => item === document.activeElement)
    const destinos: Partial<Record<string, number>> = {
      ArrowDown: (atual + 1) % itens.length,
      ArrowUp: (atual - 1 + itens.length) % itens.length,
      Home: 0,
      End: itens.length - 1,
    }
    const destino = destinos[evento.key]
    if (destino === undefined) return
    evento.preventDefault()
    itens[destino]?.focus()
  }

  const escolher = (acao: AcaoDoMenu) => {
    definirAberto(false)
    botao.current?.focus()
    acao.aoEscolher?.()
  }

  return (
    <div ref={raiz} className="relative inline-block">
      <button
        ref={botao}
        type="button"
        aria-label={rotuloAcessivel}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        onClick={() => definirAberto(!aberto)}
        className="flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center justify-center rounded-botao text-texto hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-marca"
      >
        <Ellipsis aria-hidden className="size-5" />
      </button>
      {aberto && (
        <div
          ref={menu}
          id={idMenu}
          role="menu"
          aria-label={rotuloAcessivel}
          onKeyDown={andarComTeclado}
          style={{ position: 'fixed', top: posicao?.top ?? 0, left: posicao?.left ?? 0, visibility: posicao ? 'visible' : 'hidden' }}
          className="z-40 w-max max-w-[calc(100vw-1rem)] min-w-48 rounded-cartao border border-borda-controle bg-superficie py-1 text-texto shadow-lg"
        >
          {acoes.map((acao) => {
            const perigo = acao.perigo && 'text-perigo'
            const separador = acao.perigo && 'mt-1 border-t border-divisor pt-1'
            if (acao.para)
              return (
                <Link key={acao.rotulo} to={acao.para} role="menuitem" tabIndex={-1} onClick={() => definirAberto(false)} className={cn(CLASSE_DO_ITEM, perigo, separador)}>
                  {acao.rotulo}
                </Link>
              )
            return (
              <button key={acao.rotulo} type="button" role="menuitem" tabIndex={-1} disabled={acao.desligada} onClick={() => escolher(acao)} className={cn(CLASSE_DO_ITEM, perigo, separador)}>
                {acao.rotulo}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
