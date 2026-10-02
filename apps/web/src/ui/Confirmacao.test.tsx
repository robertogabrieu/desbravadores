import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Confirmacao } from './Confirmacao'

function ComBotaoQueAbre({ erro }: { erro?: string | null }) {
  const [aberta, definirAberta] = useState(false)
  return (
    <>
      <button type="button" onClick={() => definirAberta(true)}>
        Abrir confirmação
      </button>
      <Confirmacao aberta={aberta} titulo="Apagar?" rotuloConfirmar="Apagar" erro={erro} aoConfirmar={() => undefined} aoCancelar={() => definirAberta(false)}>
        Some para todos.
      </Confirmacao>
    </>
  )
}

describe('Confirmacao', () => {
  it('Tab e Shift+Tab ficam presos dentro do diálogo', async () => {
    const usuario = userEvent.setup()
    render(<ComBotaoQueAbre />)
    await usuario.click(screen.getByRole('button', { name: 'Abrir confirmação' }))
    const cancelar = screen.getByRole('button', { name: 'Cancelar' })
    const apagar = screen.getByRole('button', { name: 'Apagar' })
    await usuario.tab()
    expect(cancelar).toHaveFocus()
    await usuario.tab()
    expect(apagar).toHaveFocus()
    await usuario.tab()
    expect(cancelar).toHaveFocus()
    await usuario.tab({ shift: true })
    expect(apagar).toHaveFocus()
  })

  it('ao fechar, o foco volta para quem abriu', async () => {
    const usuario = userEvent.setup()
    render(<ComBotaoQueAbre />)
    const abridor = screen.getByRole('button', { name: 'Abrir confirmação' })
    await usuario.click(abridor)
    expect(screen.getByRole('dialog', { name: 'Apagar?' })).toHaveFocus()
    await usuario.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(abridor).toHaveFocus()
  })

  it('mostra o erro dentro do diálogo', async () => {
    const usuario = userEvent.setup()
    render(<ComBotaoQueAbre erro="Sem permissão para apagar." />)
    await usuario.click(screen.getByRole('button', { name: 'Abrir confirmação' }))
    expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('alert'))
    expect(screen.getByRole('alert')).toHaveTextContent('Sem permissão para apagar.')
  })

  it('sem erro, não mostra alerta', async () => {
    const usuario = userEvent.setup()
    render(<ComBotaoQueAbre />)
    await usuario.click(screen.getByRole('button', { name: 'Abrir confirmação' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
