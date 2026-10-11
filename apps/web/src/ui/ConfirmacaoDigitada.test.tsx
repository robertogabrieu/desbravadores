import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmacaoDigitada } from './ConfirmacaoDigitada'

function montar() {
  const aoConfirmar = vi.fn()
  render(
    <ConfirmacaoDigitada aberta titulo="Excluir?" rotuloConfirmar="Excluir edição" textoEsperado="Classe Bíblica 2026" aoConfirmar={aoConfirmar} aoCancelar={() => undefined}>
      Esta ação não pode ser desfeita.
    </ConfirmacaoDigitada>,
  )
  return { aoConfirmar, usuario: userEvent.setup() }
}

describe('ConfirmacaoDigitada', () => {
  it('mostra o aviso e o nome a digitar, com o botão desabilitado', () => {
    montar()
    expect(screen.getByText('Esta ação não pode ser desfeita.')).toBeInTheDocument()
    expect(screen.getByText(/digite o nome da edição/)).toHaveTextContent('Classe Bíblica 2026')
    expect(screen.getByRole('button', { name: 'Excluir edição' })).toBeDisabled()
  })

  it('texto incompleto mantém o botão desabilitado e não confirma', async () => {
    const { usuario, aoConfirmar } = montar()
    await usuario.type(screen.getByLabelText('Nome para confirmar'), 'Classe Bíblica 202')
    const botao = screen.getByRole('button', { name: 'Excluir edição' })
    expect(botao).toBeDisabled()
    await usuario.click(botao)
    expect(aoConfirmar).not.toHaveBeenCalled()
  })

  it('o nome certo libera, ignorando espaços nas pontas e maiúsculas, e confirma', async () => {
    const { usuario, aoConfirmar } = montar()
    await usuario.type(screen.getByLabelText('Nome para confirmar'), '  classe bíblica 2026 ')
    const botao = screen.getByRole('button', { name: 'Excluir edição' })
    expect(botao).toBeEnabled()
    await usuario.click(botao)
    expect(aoConfirmar).toHaveBeenCalledTimes(1)
  })
})
