import { Ellipsis } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../ui/cn'
import { useMenuSuspenso } from '../../ui/useMenuSuspenso'

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
  /** Nome do botão para o leitor de tela, ex.: "Ações do pedido K7Q2XM". */
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
 * rolagem da tabela: abre à esquerda do botão, alinhado ao topo dele, e sobe o quanto precisar para caber na janela.
 * Teclado: abrir leva ao primeiro item, setas e Home/End andam, Esc devolve o foco ao botão, Tab fecha.
 */
export function MenuDeAcoes({ rotuloAcessivel, acoes }: Propriedades) {
  const [aberto, definirAberto] = useState(false)
  const [posicao, definirPosicao] = useState<Posicao | null>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const idMenu = useId()
  const idBotao = useId()

  useLayoutEffect(() => {
    if (!aberto || !botao.current || !menu.current) return
    const alvo = botao.current.getBoundingClientRect()
    const { width, height } = menu.current.getBoundingClientRect()
    // O menu abre ao lado do botão, nunca embaixo dele: embaixo cobriria as reticências da linha seguinte e um clique
    // para trocar de menu cairia num item e executaria a ação.
    const left = Math.max(MARGEM_DA_TELA, alvo.left - AFASTAMENTO - width)
    const top = Math.max(MARGEM_DA_TELA, Math.min(alvo.top, window.innerHeight - MARGEM_DA_TELA - height))
    definirPosicao({ top, left })
    return () => definirPosicao(null)
  }, [aberto])

  const fechar = useCallback(() => definirAberto(false), [])
  const andarComTeclado = useMenuSuspenso({ aberto, aoFechar: fechar, raiz, botao, menu, seletorDosItens: ITENS, pronto: posicao !== null })

  // A posição é fixa na janela: rolar a página ou a tabela, ou redimensionar, a deixaria solta do botão.
  useEffect(() => {
    if (!aberto) return
    const aoRolar = (evento: Event) => {
      if (!menu.current?.contains(evento.target as Node)) fechar()
    }
    window.addEventListener('scroll', aoRolar, true)
    window.addEventListener('resize', fechar)
    return () => {
      window.removeEventListener('scroll', aoRolar, true)
      window.removeEventListener('resize', fechar)
    }
  }, [aberto, fechar])

  const escolher = (acao: AcaoDoMenu) => {
    definirAberto(false)
    botao.current?.focus()
    acao.aoEscolher?.()
  }

  // Sem ação não há o que abrir: um menu vazio seria só um botão que não responde.
  if (acoes.length === 0) return null

  return (
    <div ref={raiz} className="relative inline-block">
      <button
        ref={botao}
        id={idBotao}
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
          aria-labelledby={idBotao}
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
