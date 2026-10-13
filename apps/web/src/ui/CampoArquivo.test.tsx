import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CampoArquivo } from './CampoArquivo'

describe('CampoArquivo', () => {
  it('mostra o nome do arquivo escolhido e avisa quem usa o campo', async () => {
    const aoMudar = vi.fn()
    render(<CampoArquivo rotulo="PDF" accept="application/pdf" onChange={aoMudar} />)

    expect(screen.getByText('Escolher arquivo')).toBeInTheDocument()
    await userEvent.upload(screen.getByLabelText(/Escolher arquivo/), new File(['x'], 'regulamento.pdf', { type: 'application/pdf' }))

    expect(screen.getByText('regulamento.pdf')).toBeInTheDocument()
    expect(aoMudar).toHaveBeenCalledTimes(1)
  })

  it('mostra o erro e liga a descrição ao campo', () => {
    render(<CampoArquivo rotulo="PDF" erro="Escolha o arquivo." onChange={() => {}} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Escolha o arquivo.')
    expect(screen.getByLabelText(/Escolher arquivo/)).toHaveAttribute('aria-invalid', 'true')
  })
})
