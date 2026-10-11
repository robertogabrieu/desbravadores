import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CampoData } from './CampoData'

function Teste({ inicial = '', min, max }: { inicial?: string; min?: string; max?: string }) {
  const [valor, setValor] = useState(inicial)
  return (
    <>
      <CampoData rotulo="Nascimento" value={valor} onChange={setValor} min={min} max={max} />
      <output data-testid="iso">{valor}</output>
    </>
  )
}

const iso = () => screen.getByTestId('iso').textContent

describe('CampoData', () => {
  it('digita com máscara e entrega ISO só quando a data está completa', async () => {
    render(<Teste />)
    const campo = screen.getByLabelText('Nascimento')
    await userEvent.type(campo, '20052')
    expect(campo).toHaveValue('20/05/2')
    expect(iso()).toBe('')
    await userEvent.type(campo, '015')
    expect(campo).toHaveValue('20/05/2015')
    expect(iso()).toBe('2015-05-20')
  })

  it('reprova 31/02 com mensagem e sem entregar valor', async () => {
    render(<Teste />)
    await userEvent.type(screen.getByLabelText('Nascimento'), '31022024')
    expect(iso()).toBe('')
    expect(screen.getByRole('alert')).toHaveTextContent('não existe')
  })

  it('mostra o valor ISO inicial como DD/MM/AAAA', () => {
    render(<Teste inicial="2015-05-20" />)
    expect(screen.getByLabelText('Nascimento')).toHaveValue('20/05/2015')
  })

  it('escolhe no calendário em pt-BR, fecha e devolve o foco ao campo', async () => {
    render(<Teste inicial="2026-03-10" />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir calendário de Nascimento' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('grid')).toHaveAccessibleName(/março 2026/i)
    await userEvent.click(screen.getByRole('button', { name: /(^| )15 de março de 2026/i }))
    expect(iso()).toBe('2026-03-15')
    expect(screen.getByLabelText('Nascimento')).toHaveValue('15/03/2026')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nascimento')).toHaveFocus()
  })

  it('fecha com Esc e com clique fora', async () => {
    render(<Teste />)
    const abrir = screen.getByRole('button', { name: 'Abrir calendário de Nascimento' })
    await userEvent.click(abrir)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nascimento')).toHaveFocus()
    await userEvent.click(abrir)
    await userEvent.click(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('desabilita no calendário os dias fora de min e max', async () => {
    render(<Teste inicial="2026-03-10" min="2026-03-05" max="2026-03-20" />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir calendário de Nascimento' }))
    expect(screen.getByRole('button', { name: /(^| )4 de março de 2026/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /(^| )21 de março de 2026/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /(^| )12 de março de 2026/i })).toBeEnabled()
  })

  it('no modo compacto não tem botão de calendário e usa o rótulo como nome acessível', () => {
    render(<CampoData compacto rotulo="Nascimento, linha 1" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('Nascimento, linha 1')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
