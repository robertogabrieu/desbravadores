import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SelecaoPesquisavel } from './SelecaoPesquisavel'

const OPCOES = [
  { valor: 'a', rotulo: 'Ana Souza' },
  { valor: 'b', rotulo: 'Bruno Lima' },
  { valor: 'c', rotulo: 'Bianca Reis' },
]

function Exemplo({ erro }: { erro?: string }) {
  const [valor, definirValor] = useState('')
  return (
    <>
      <SelecaoPesquisavel rotulo="Pessoa" opcoes={OPCOES} valor={valor} aoMudar={definirValor} erro={erro} />
      <output>{valor}</output>
    </>
  )
}

describe('SelecaoPesquisavel', () => {
  it('filtra pelo que se digita e devolve o valor da opção escolhida', async () => {
    render(<Exemplo />)

    await userEvent.type(screen.getByLabelText('Pessoa'), 'bi')

    expect(screen.queryByRole('option', { name: 'Ana Souza' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: 'Bianca Reis' }))
    expect(screen.getByRole('status')).toHaveTextContent('c')
  })

  it('avisa quando nada combina com a busca', async () => {
    render(<Exemplo />)

    await userEvent.type(screen.getByLabelText('Pessoa'), 'zzz')

    expect(screen.getByText('Nada encontrado')).toBeInTheDocument()
  })

  it('mostra o erro e marca o campo como inválido', () => {
    render(<Exemplo erro="Escolha uma pessoa." />)

    expect(screen.getByRole('alert')).toHaveTextContent('Escolha uma pessoa.')
    expect(screen.getByLabelText('Pessoa')).toHaveAttribute('aria-invalid', 'true')
  })
})
