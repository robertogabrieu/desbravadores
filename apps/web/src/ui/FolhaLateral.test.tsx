import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { FolhaLateral } from './FolhaLateral'

function ComGatilho() {
  const [aberta, setAberta] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAberta(true)}>
        Abrir
      </button>
      <FolhaLateral aberta={aberta} titulo="Novo" aoFechar={() => setAberta(false)}>
        <input aria-label="Nome" />
        <button type="button">Salvar</button>
      </FolhaLateral>
    </>
  )
}

describe('FolhaLateral: foco', () => {
  it('prende o Tab dentro do painel nos dois sentidos', async () => {
    render(<ComGatilho />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    const fechar = screen.getByRole('button', { name: 'Fechar' })
    const salvar = screen.getByRole('button', { name: 'Salvar' })

    salvar.focus()
    await userEvent.tab()
    expect(fechar).toHaveFocus()

    await userEvent.tab({ shift: true })
    expect(salvar).toHaveFocus()
  })

  it('Shift+Tab a partir do próprio painel vai para o último controle', async () => {
    render(<ComGatilho />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(screen.getByRole('dialog')).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveFocus()
  })

  it('devolve o foco a quem abriu ao fechar', async () => {
    render(<ComGatilho />)
    const abrir = screen.getByRole('button', { name: 'Abrir' })
    await userEvent.click(abrir)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(abrir).toHaveFocus()
  })
})
