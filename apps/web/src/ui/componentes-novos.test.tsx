import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Abas } from './Abas'
import { AreaTexto } from './AreaTexto'
import { CampoData } from './CampoData'
import { Avatar } from './Avatar'
import { BarraProgresso } from './BarraProgresso'
import { Chip } from './Chip'
import { Confirmacao } from './Confirmacao'
import { Esqueleto } from './Esqueleto'
import { Selo } from './Selo'

describe('Abas', () => {
  const abas = [
    { id: 'a', rotulo: 'Unidade' },
    { id: 'b', rotulo: 'Classe' },
  ]

  it('marca a ativa e avisa ao escolher outra', async () => {
    const aoMudar = vi.fn()
    render(<Abas rotulo="Seções" abas={abas} ativa="a" aoMudar={aoMudar} />)

    expect(screen.getByRole('tab', { name: 'Unidade' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Classe' })).toHaveAttribute('aria-selected', 'false')

    await userEvent.click(screen.getByRole('tab', { name: 'Classe' }))
    expect(aoMudar).toHaveBeenCalledWith('b')
  })

  it('setas movem entre abas', async () => {
    const aoMudar = vi.fn()
    render(<Abas rotulo="Seções" abas={abas} ativa="a" aoMudar={aoMudar} />)

    screen.getByRole('tab', { name: 'Unidade' }).focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(aoMudar).toHaveBeenCalledWith('b')
  })
})

describe('Avatar', () => {
  it('mostra as iniciais do primeiro e do último nome', () => {
    render(<Avatar nome="Ana Maria Souza" />)
    expect(screen.getByText('AS')).toBeInTheDocument()
  })

  it('nome de uma palavra dá uma inicial; nome vazio dá interrogação', () => {
    const { rerender } = render(<Avatar nome="Davi" />)
    expect(screen.getByText('D')).toBeInTheDocument()
    rerender(<Avatar nome="  " />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('a classe define a cor', () => {
    render(<Avatar nome="Ana Souza" classe="guia" />)
    expect(screen.getByText('AS')).toHaveClass('bg-guia')
  })
})

describe('Confirmacao', () => {
  it('fechada não renderiza', () => {
    render(<Confirmacao aberta={false} titulo="Sair?" rotuloConfirmar="Sair" aoConfirmar={() => undefined} aoCancelar={() => undefined}>corpo</Confirmacao>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('aberta: confirma, cancela e cancela com Esc', async () => {
    const aoConfirmar = vi.fn()
    const aoCancelar = vi.fn()
    render(<Confirmacao aberta titulo="Sair?" rotuloConfirmar="Sair" aoConfirmar={aoConfirmar} aoCancelar={aoCancelar}>corpo</Confirmacao>)

    expect(screen.getByRole('dialog', { name: 'Sair?' })).toHaveTextContent('corpo')
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.keyboard('{Escape}')

    expect(aoConfirmar).toHaveBeenCalledTimes(1)
    expect(aoCancelar).toHaveBeenCalledTimes(2)
  })
})

describe('Selo', () => {
  it('mostra o conteúdo e o tom', () => {
    render(<Selo tom="alerta">2 aguardando envio</Selo>)
    expect(screen.getByText('2 aguardando envio')).toHaveAttribute('data-tom', 'alerta')
  })
})

describe('BarraProgresso', () => {
  it('expõe o valor e limita a 0–100', () => {
    const { rerender } = render(<BarraProgresso valor={60} rotulo="Enviando foto" />)
    expect(screen.getByRole('progressbar', { name: 'Enviando foto' })).toHaveAttribute('aria-valuenow', '60')
    rerender(<BarraProgresso valor={140} rotulo="Enviando foto" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    rerender(<BarraProgresso valor={-5} rotulo="Enviando foto" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })
})

describe('Chip', () => {
  it('alterna: informa o estado e chama com o valor novo', async () => {
    const aoAlternar = vi.fn()
    const { rerender } = render(<Chip selecionado={false} aoAlternar={aoAlternar}>Presente</Chip>)
    const chip = screen.getByRole('button', { name: 'Presente' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(chip)
    expect(aoAlternar).toHaveBeenCalledWith(true)

    rerender(<Chip selecionado aoAlternar={aoAlternar}>Presente</Chip>)
    expect(screen.getByRole('button', { name: 'Presente' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Presente' }))
    expect(aoAlternar).toHaveBeenLastCalledWith(false)
  })

  it('alvo de toque de 44 px', () => {
    render(<Chip selecionado={false} aoAlternar={() => undefined}>Presente</Chip>)
    expect(screen.getByRole('button', { name: 'Presente' })).toHaveClass('min-h-[var(--touch-min)]')
  })
})

describe('Esqueleto', () => {
  it('é decorativo, escondido de leitor de tela', () => {
    render(<Esqueleto data-testid="e" className="h-4" />)
    expect(screen.getByTestId('e')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('AreaTexto', () => {
  it('liga o rótulo ao campo, aceita digitação e mostra o erro', async () => {
    const aoMudar = vi.fn()
    render(<AreaTexto rotulo="Observação" erro="Escreva algo" onChange={aoMudar} />)

    const campo = screen.getByRole('textbox', { name: 'Observação' })
    expect(campo.tagName).toBe('TEXTAREA')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Escreva algo')

    await userEvent.type(campo, 'oi')
    expect(aoMudar).toHaveBeenCalledTimes(2)
  })
})

describe('CampoData', () => {
  it('é um campo de data com rótulo e devolve o valor escolhido', async () => {
    const aoMudar = vi.fn()
    render(<CampoData rotulo="Data" ajuda="Dia da reunião" onChange={aoMudar} />)

    const campo = screen.getByLabelText('Data')
    expect(campo).toHaveAttribute('type', 'date')
    expect(screen.getByText('Dia da reunião')).toBeInTheDocument()

    await userEvent.type(campo, '2030-09-14')
    expect(campo).toHaveValue('2030-09-14')
    expect(aoMudar).toHaveBeenCalled()
  })
})
