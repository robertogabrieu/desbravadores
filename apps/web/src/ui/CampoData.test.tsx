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

  it('"/" completa o bloco com zero: 1/5/2024 vira 01/05/2024', async () => {
    render(<Teste />)
    const campo = screen.getByLabelText('Nascimento')
    await userEvent.type(campo, '1/')
    expect(campo).toHaveValue('01/')
    await userEvent.type(campo, '5/2024')
    expect(campo).toHaveValue('01/05/2024')
    expect(iso()).toBe('2024-05-01')
  })

  it('apagar a barra funciona e o cursor fica onde estava', async () => {
    render(<Teste />)
    const campo = screen.getByLabelText('Nascimento') as HTMLInputElement
    await userEvent.type(campo, '010520')
    campo.setSelectionRange(3, 3)
    await userEvent.keyboard('{Backspace}')
    expect(campo).toHaveValue('01/05/20')
    campo.setSelectionRange(1, 1)
    await userEvent.keyboard('9')
    expect(campo.selectionStart).toBe(3)
  })

  it('data fora de min/max mostra mensagem no campo', async () => {
    render(<Teste min="2026-03-05" max="2026-03-20" />)
    const campo = screen.getByLabelText('Nascimento')
    await userEvent.type(campo, '01012020')
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha uma data entre 05/03/2026 e 20/03/2026.')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    await userEvent.clear(campo)
    await userEvent.type(campo, '10032026')
    expect(screen.queryByRole('alert')).toBeNull()
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

  it('no modo compacto, data inexistente fica aria-invalid, leva a mensagem no nome acessível e não aponta para ajuda invisível', async () => {
    render(<CampoData compacto rotulo="Nascimento, linha 1" ajuda="Dia, mês e ano." value="" onChange={() => {}} />)
    const campo = screen.getByLabelText('Nascimento, linha 1')
    await userEvent.type(campo, '31022024')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).not.toHaveAttribute('aria-describedby')
    expect(campo).toHaveAccessibleName(/^Nascimento, linha 1, Essa data não existe/)
    expect(campo).toHaveValue('31/02/2024')
  })

  it('apagar o 1º dígito de uma data cheia e redigitar restaura o valor, com cursor no lugar', async () => {
    render(<Teste inicial="2024-05-12" />)
    const campo = screen.getByLabelText('Nascimento') as HTMLInputElement
    await userEvent.click(campo)
    campo.setSelectionRange(1, 1)
    await userEvent.keyboard('{Backspace}')
    expect(campo).toHaveValue('20/52/024')
    await userEvent.keyboard('1')
    expect(campo).toHaveValue('12/05/2024')
    expect(campo.selectionStart).toBe(1)
  })

  it('"1" + "/" vira "01/" com o cursor depois da barra', async () => {
    render(<Teste />)
    const campo = screen.getByLabelText('Nascimento') as HTMLInputElement
    await userEvent.type(campo, '1/')
    expect(campo).toHaveValue('01/')
    expect(campo.selectionStart).toBe(3)
  })

  it('colar AAAA-MM-DD converte para DD/MM/AAAA', async () => {
    render(<Teste />)
    const campo = screen.getByLabelText('Nascimento')
    await userEvent.click(campo)
    await userEvent.paste('2024-05-01')
    expect(campo).toHaveValue('01/05/2024')
    expect(iso()).toBe('2024-05-01')
  })

  it('digitar no meio de data parcial só reposiciona os dígitos', async () => {
    render(<Teste />)
    const campo = screen.getByLabelText('Nascimento') as HTMLInputElement
    await userEvent.type(campo, '120520')
    campo.setSelectionRange(1, 1)
    await userEvent.keyboard('3')
    expect(campo).toHaveValue('13/20/520')
    expect(campo.selectionStart).toBe(3)
  })
})
