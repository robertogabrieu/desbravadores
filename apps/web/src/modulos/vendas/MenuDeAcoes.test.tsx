import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MenuDeAcoes } from './MenuDeAcoes'
import type { AcaoDoMenu } from './MenuDeAcoes'

afterEach(() => vi.restoreAllMocks())

const escolhida = vi.fn()
const ACOES: AcaoDoMenu[] = [
  { rotulo: 'Primeira', aoEscolher: escolhida },
  { rotulo: 'Desligada', aoEscolher: escolhida, desligada: true },
  { rotulo: 'Terceira', aoEscolher: escolhida },
  { rotulo: 'Perigosa', aoEscolher: escolhida, perigo: true },
]

function abrir(acoes: AcaoDoMenu[] = ACOES) {
  render(
    <MemoryRouter>
      <MenuDeAcoes rotuloAcessivel="Ações do pedido nº 7" acoes={acoes} />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

const botao = (numero = 7) => screen.getByRole('button', { name: `Ações do pedido nº ${numero}` })

describe('MenuDeAcoes', () => {
  it('só leva o foco ao primeiro item depois de o menu estar posicionado', async () => {
    const visibilidades: string[] = []
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = HTMLElement.prototype.focus
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, opcoes?: FocusOptions) {
      if (this.getAttribute('role') === 'menuitem') visibilidades.push(this.closest<HTMLElement>('[role="menu"]')?.style.visibility ?? '')
      original.call(this, opcoes)
    })
    const usuario = abrir()
    await usuario.click(botao())
    expect(screen.getByRole('menuitem', { name: 'Primeira' })).toHaveFocus()
    expect(visibilidades).toEqual(['visible'])
  })

  it('setas, Home e End andam pelos itens e pulam o desligado', async () => {
    const usuario = abrir()
    await usuario.click(botao())
    await usuario.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Terceira' })).toHaveFocus()
    await usuario.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: 'Perigosa' })).toHaveFocus()
    await usuario.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Primeira' })).toHaveFocus()
    await usuario.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Perigosa' })).toHaveFocus()
    await usuario.keyboard('{Home}')
    expect(screen.getByRole('menuitem', { name: 'Primeira' })).toHaveFocus()
  })

  it('escolher um item fecha o menu, devolve o foco ao botão e executa a ação', async () => {
    escolhida.mockClear()
    const usuario = abrir()
    await usuario.click(botao())
    await usuario.click(screen.getByRole('menuitem', { name: 'Terceira' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(botao()).toHaveFocus()
    expect(escolhida).toHaveBeenCalledTimes(1)
  })

  it('Tab fecha o menu e segue para o que vem depois do botão, não para o fim da página', async () => {
    const usuario = userEvent.setup()
    render(
      <MemoryRouter>
        <MenuDeAcoes rotuloAcessivel="Ações do pedido nº 7" acoes={ACOES} />
        <button type="button">Depois</button>
      </MemoryRouter>,
    )
    await usuario.click(botao())
    await usuario.keyboard('{Tab}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Depois' })).toHaveFocus()
  })

  it('rolar a página fecha o menu, mas rolar dentro dele não', async () => {
    const usuario = abrir()
    await usuario.click(botao())
    fireEvent.scroll(screen.getByRole('menu'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.scroll(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('abre ao lado do botão, sem cobrir as reticências das outras linhas, e inteiro na janela', async () => {
    const retangulo = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'menu' ? retangulo(0, 0, 192, 190) : retangulo(900, 700, 44, 44)
    })
    const usuario = abrir()
    await usuario.click(botao())
    const menu = screen.getByRole('menu')
    const esquerda = Number.parseFloat(menu.style.left)
    const topo = Number.parseFloat(menu.style.top)
    // Coluna do botão: x de 900 a 944. Qualquer pedaço do menu nela cobriria o botão da linha de baixo.
    expect(esquerda + 192).toBeLessThanOrEqual(900)
    expect(esquerda).toBeGreaterThanOrEqual(0)
    expect(topo + 190).toBeLessThanOrEqual(window.innerHeight)
    expect(topo).toBeGreaterThanOrEqual(0)
  })

  it('o menu tem o botão como nome', async () => {
    const usuario = abrir()
    await usuario.click(botao())
    expect(screen.getByRole('menu', { name: 'Ações do pedido nº 7' })).toBeInTheDocument()
  })

  it('sem nenhuma ação não mostra o botão', () => {
    abrir([])
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('um clique nas reticências de outro menu fecha o aberto e abre o novo', async () => {
    const usuario = userEvent.setup()
    render(
      <MemoryRouter>
        <MenuDeAcoes rotuloAcessivel="Ações do pedido nº 7" acoes={ACOES} />
        <MenuDeAcoes rotuloAcessivel="Ações do pedido nº 8" acoes={[{ rotulo: 'Outra', aoEscolher: escolhida }]} />
      </MemoryRouter>,
    )
    await usuario.click(botao(7))
    await usuario.click(botao(8))
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.getByRole('menuitem', { name: 'Outra' })).toHaveFocus()
  })
})
