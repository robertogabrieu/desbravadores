import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { criarFoto } from '../../testes/handlers/fotos'
import { uuid } from '../../testes/handlers/sessao'
import { FotoCheia } from './FotoCheia'

const FOTOS = [criarFoto({ id: uuid(801) }), criarFoto({ id: uuid(802) })]

function ComGatilho() {
  const [indice, setIndice] = useState<number | null>(null)
  return (
    <>
      <button type="button" onClick={() => setIndice(0)}>
        Ver foto
      </button>
      {indice !== null && <FotoCheia fotos={FOTOS} indice={indice} aoMudar={setIndice} aoFechar={() => setIndice(null)} aoRemover={vi.fn()} />}
    </>
  )
}

describe('FotoCheia: foco', () => {
  it('recebe o foco ao abrir', async () => {
    render(<ComGatilho />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver foto' }))
    expect(screen.getByRole('dialog', { name: 'Foto 1 de 2' })).toHaveFocus()
  })

  it('devolve o foco a quem abriu ao fechar', async () => {
    render(<ComGatilho />)
    const abrir = screen.getByRole('button', { name: 'Ver foto' })
    await userEvent.click(abrir)
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(abrir).toHaveFocus()
  })

  it('devolve o foco também quando fecha pelo Esc', async () => {
    render(<ComGatilho />)
    const abrir = screen.getByRole('button', { name: 'Ver foto' })
    await userEvent.click(abrir)
    await userEvent.keyboard('{Escape}')
    expect(abrir).toHaveFocus()
  })
})
