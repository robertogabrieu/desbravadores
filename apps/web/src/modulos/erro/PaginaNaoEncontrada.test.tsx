import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PaginaNaoEncontrada } from './PaginaNaoEncontrada'

describe('PaginaNaoEncontrada', () => {
  it('diz que a página não existe e oferece o link para "/"', () => {
    render(
      <MemoryRouter>
        <PaginaNaoEncontrada />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/')
  })
})
