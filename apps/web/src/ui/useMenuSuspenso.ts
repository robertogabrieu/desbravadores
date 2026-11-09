import { useEffect, useRef } from 'react'
import type { KeyboardEvent as EventoTeclado, RefObject } from 'react'

interface Opcoes {
  aberto: boolean
  aoFechar: () => void
  /** Contêiner do botão e do menu: clique dentro dele não conta como "fora". */
  raiz: RefObject<HTMLElement | null>
  botao: RefObject<HTMLElement | null>
  menu: RefObject<HTMLElement | null>
  /** Seletor dos itens que recebem foco; itens desligados ficam de fora dele. */
  seletorDosItens: string
  /** O menu já está onde vai ficar. Foco em menu escondido não pega, então só se foca depois disto. */
  pronto?: boolean
  /** Item que recebe o foco ao abrir; sem ele, o primeiro. */
  focoInicial?: () => HTMLElement | null | undefined
}

/**
 * Comportamento comum dos menus suspensos: foco ao abrir, clique fora e Esc fecham, setas e Home/End andam,
 * Tab fecha deixando o foco no botão. Devolve o tratador de teclas para o `onKeyDown` do menu.
 */
export function useMenuSuspenso({ aberto, aoFechar, raiz, botao, menu, seletorDosItens, pronto = aberto, focoInicial }: Opcoes) {
  // Só abrir e ficar pronto movem o foco: um `focoInicial` novo a cada render não pode puxá-lo de volta.
  const escolherFocoInicial = useRef(focoInicial)
  escolherFocoInicial.current = focoInicial

  useEffect(() => {
    if (!aberto || !pronto) return
    const inicial = escolherFocoInicial.current?.() ?? menu.current?.querySelector<HTMLElement>(seletorDosItens)
    inicial?.focus()
  }, [aberto, pronto, menu, seletorDosItens])

  useEffect(() => {
    if (!aberto) return
    const aoClicarFora = (evento: MouseEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) aoFechar()
    }
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return
      aoFechar()
      botao.current?.focus()
    }
    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto, aoFechar, raiz, botao])

  return (evento: EventoTeclado<HTMLElement>) => {
    if (evento.key === 'Tab') {
      aoFechar()
      botao.current?.focus()
      return
    }
    const itens = [...(menu.current?.querySelectorAll<HTMLElement>(seletorDosItens) ?? [])]
    if (itens.length === 0) return
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
}
