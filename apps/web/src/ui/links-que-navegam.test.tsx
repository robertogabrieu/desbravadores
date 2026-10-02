import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LinhaQueNavega } from './LinhaQueNavega'
import { LinkDeFicha, NomeDaFicha } from './LinkDeFicha'

function Onde() {
  const local = useLocation()
  const estado: unknown = local.state
  return <p data-testid="onde">{`${local.pathname} ${JSON.stringify(estado)}`}</p>
}

const emRota = (conteudo: ReactNode) =>
  render(
    <MemoryRouter initialEntries={['/inicio']}>
      <Routes>
        <Route path="/inicio" element={conteudo} />
        <Route path="*" element={<Onde />} />
      </Routes>
    </MemoryRouter>,
  )

const sinal = (elemento: HTMLElement, qual: string) => elemento.querySelector(`[data-sinal="${qual}"]`)

describe('LinhaQueNavega', () => {
  it('mostra a seta à direita sempre, sem depender do hover, e navega levando o estado', async () => {
    emRota(
      <LinhaQueNavega to="/destino" state={{ voltarPara: '/inicio' }}>
        Reunião de domingo
      </LinhaQueNavega>,
    )
    const link = screen.getByRole('link', { name: 'Reunião de domingo' })
    const seta = sinal(link, 'navega')
    expect(seta).not.toBeNull()
    expect(seta).toHaveAttribute('aria-hidden', 'true')
    expect(seta?.getAttribute('class')).not.toMatch(/hover:|hidden|opacity-0/)
    expect(link.lastElementChild).toBe(seta)

    await userEvent.click(link)
    expect(screen.getByTestId('onde')).toHaveTextContent('/destino {"voltarPara":"/inicio"}')
  })

  it('a forma de cartão tem borda e canto de cartão; a de linha, alvo de toque mínimo', () => {
    emRota(
      <>
        <LinhaQueNavega to="/a" forma="cartao">
          Cartão
        </LinhaQueNavega>
        <LinhaQueNavega to="/b">Linha</LinhaQueNavega>
      </>,
    )
    expect(screen.getByRole('link', { name: 'Cartão' })).toHaveClass('rounded-cartao', 'border')
    expect(screen.getByRole('link', { name: 'Linha' })).toHaveClass('min-h-[var(--touch-min)]')
  })

  it('o aria-label substitui o nome acessível quando a tela pede', () => {
    emRota(
      <LinhaQueNavega to="/a" aria-label="Águias, 8 DBVs">
        Águias
      </LinhaQueNavega>,
    )
    expect(screen.getByRole('link', { name: 'Águias, 8 DBVs' })).toBeInTheDocument()
  })

  it('quando abre a ficha de uma pessoa, a seta sai e o sinal é o do nome', () => {
    emRota(
      <LinhaQueNavega to="/ficha" sinal="ficha">
        <NomeDaFicha nome="Ana Souza" />
      </LinhaQueNavega>,
    )
    const link = screen.getByRole('link', { name: 'Ana Souza' })
    expect(sinal(link, 'navega')).toBeNull()
    expect(sinal(link, 'abre-ficha')).not.toBeNull()
  })
})

describe('LinkDeFicha', () => {
  it('o ícone de abrir fica ao lado do nome, dentro do link, e o nome acessível continua sendo o nome', async () => {
    emRota(<LinkDeFicha to="/adm/desbravadores/1" nome="Ana Clara Souza" state={{ voltarPara: '/inicio' }} />)
    const link = screen.getByRole('link', { name: 'Ana Clara Souza' })
    const icone = sinal(link, 'abre-ficha')
    expect(icone).not.toBeNull()
    expect(icone).toHaveAttribute('aria-hidden', 'true')
    expect(icone?.getAttribute('class')).not.toMatch(/hover:|hidden|opacity-0/)
    expect(sinal(link, 'navega')).toBeNull()

    await userEvent.click(link)
    expect(screen.getByTestId('onde')).toHaveTextContent('/adm/desbravadores/1 {"voltarPara":"/inicio"}')
  })
})
