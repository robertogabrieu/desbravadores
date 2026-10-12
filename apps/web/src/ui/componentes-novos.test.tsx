import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Abas } from './Abas'
import { AreaTexto } from './AreaTexto'
import { CampoData } from './CampoData'
import { Avatar } from './Avatar'
import { BarraProgresso } from './BarraProgresso'
import { Chip } from './Chip'
import { Confirmacao } from './Confirmacao'
import { EscolhaUnica } from './EscolhaUnica'
import { ResumoDosErros, useErrosAVista } from './ErrosDoFormulario'
import { Esqueleto } from './Esqueleto'
import { Interruptor } from './Interruptor'
import { RodapeDoFormulario } from './RodapeDoFormulario'
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
    expect(aoMudar).toHaveBeenCalledExactlyOnceWith('b', 'toque')
  })

  it('setas movem entre abas', async () => {
    const aoMudar = vi.fn()
    render(<Abas rotulo="Seções" abas={abas} ativa="a" aoMudar={aoMudar} />)

    screen.getByRole('tab', { name: 'Unidade' }).focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(aoMudar).toHaveBeenCalledExactlyOnceWith('b', 'teclado')
  })

  it('quebram linha em vez de rolar de lado, e cada aba fica inteira numa linha só', () => {
    render(<Abas rotulo="Seções" abas={[...abas, { id: 'c', rotulo: 'Instrutores · 1' }]} ativa="c" aoMudar={vi.fn()} />)

    const faixa = screen.getByRole('tablist', { name: 'Seções' })
    expect(faixa).toHaveClass('flex-wrap')
    expect(faixa.className).not.toMatch(/overflow-x/)
    for (const aba of screen.getAllByRole('tab')) {
      expect(aba).toHaveClass('whitespace-nowrap', 'min-h-[var(--touch-min)]')
    }
    expect(screen.getByRole('tab', { name: 'Instrutores · 1' })).toHaveAttribute('aria-selected', 'true')
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

  it('contorno de controle (3:1), nunca a borda clara, nas duas variantes', () => {
    render(
      <>
        <Chip selecionado={false} aoAlternar={() => undefined}>Suave</Chip>
        <Chip variante="cheia" selecionado={false} aoAlternar={() => undefined}>Cheia</Chip>
      </>,
    )
    for (const nome of ['Suave', 'Cheia']) {
      const chip = screen.getByRole('button', { name: nome })
      expect(chip).toHaveClass('border-borda-controle')
      expect(chip).not.toHaveClass('border-borda')
      expect(chip).toHaveClass('min-h-[var(--touch-min)]')
    }
  })

  it('cheia: selecionada é preenchida com a marca e um ✓ decorativo à esquerda', () => {
    const { rerender } = render(<Chip variante="cheia" selecionado={false} aoAlternar={() => undefined}>Águias</Chip>)
    const chip = () => screen.getByRole('button', { name: 'Águias' })
    expect(chip()).toHaveAttribute('aria-pressed', 'false')
    expect(chip()).not.toHaveClass('bg-marca')
    expect(chip().querySelector('svg')).toBeNull()

    rerender(<Chip variante="cheia" selecionado aoAlternar={() => undefined}>Águias</Chip>)
    expect(chip()).toHaveAttribute('aria-pressed', 'true')
    expect(chip()).toHaveClass('bg-marca', 'text-sobre-marca')
    const icone = chip().firstElementChild
    expect(icone?.tagName.toLowerCase()).toBe('svg')
    expect(icone).toHaveAttribute('aria-hidden', 'true')
  })

  it('suave: selecionada continua suave', () => {
    render(<Chip selecionado aoAlternar={() => undefined}>Presente</Chip>)
    const chip = screen.getByRole('button', { name: 'Presente' })
    expect(chip).toHaveClass('bg-marca-suave')
    expect(chip).not.toHaveClass('bg-marca')
    expect(chip.querySelector('svg')).toBeNull()
  })
})

describe('Interruptor', () => {
  function Montar({ ligado, aoAlternar }: { ligado: boolean; aoAlternar: (ligado: boolean) => void }) {
    return (
      <>
        <span id="rotulo">Ver desbravadores</span>
        <span id="estado">padrão</span>
        <Interruptor ligado={ligado} aoAlternar={aoAlternar} idRotulo="rotulo" idDescricao="estado" />
      </>
    )
  }

  it('é um switch nomeado pelo rótulo, descrito pela etiqueta, com alvo de 44 px', () => {
    render(<Montar ligado={false} aoAlternar={() => undefined} />)
    const chave = screen.getByRole('switch', { name: 'Ver desbravadores' })
    expect(chave).toHaveAttribute('aria-checked', 'false')
    expect(chave).toHaveAccessibleDescription('padrão')
    expect(chave).toHaveClass('h-[var(--touch-min)]')
  })

  it('clique e Espaço pedem o valor contrário; aria-checked acompanha', async () => {
    const aoAlternar = vi.fn()
    const { rerender } = render(<Montar ligado={false} aoAlternar={aoAlternar} />)
    await userEvent.click(screen.getByRole('switch'))
    expect(aoAlternar).toHaveBeenLastCalledWith(true)

    rerender(<Montar ligado aoAlternar={aoAlternar} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    screen.getByRole('switch').focus()
    await userEvent.keyboard(' ')
    expect(aoAlternar).toHaveBeenLastCalledWith(false)
  })
})

describe('RodapeDoFormulario', () => {
  it('rotuloCancelar troca o texto do link; Salvar vem antes no DOM', () => {
    render(
      <MemoryRouter>
        <form>
          <RodapeDoFormulario cancelar={{ para: '/volta' }} rotuloCancelar="Voltar" salvando={false} />
        </form>
      </MemoryRouter>,
    )
    const voltar = screen.getByRole('link', { name: 'Voltar' })
    expect(voltar).toHaveAttribute('href', '/volta')
    expect(screen.queryByRole('link', { name: 'Cancelar' })).toBeNull()
    const salvar = screen.getByRole('button', { name: 'Salvar' })
    expect(salvar.compareDocumentPosition(voltar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sem rotuloCancelar, continua "Cancelar"', () => {
    render(
      <MemoryRouter>
        <RodapeDoFormulario cancelar={{ para: '/volta' }} salvando={false} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Cancelar' })).toBeInTheDocument()
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
  it('é um campo de data com rótulo e devolve o valor escolhido em ISO', async () => {
    const aoMudar = vi.fn()
    render(<CampoData rotulo="Data" ajuda="Dia da reunião" value="" onChange={aoMudar} />)

    const campo = screen.getByLabelText('Data')
    expect(campo).toHaveAttribute('inputmode', 'numeric')
    expect(screen.getByText('Dia da reunião')).toBeInTheDocument()

    await userEvent.type(campo, '14092030')
    expect(aoMudar).toHaveBeenLastCalledWith('2030-09-14')
  })
})

describe('EscolhaUnica', () => {
  const OPCOES = [
    { valor: 'GALA', rotulo: 'Uniforme de gala' },
    { valor: 'CAMPO', rotulo: 'Uniforme de campo' },
  ]

  it('é um grupo com legenda e abre sem nenhuma opção marcada', () => {
    render(<EscolhaUnica legenda="Uniforme do evento" opcoes={OPCOES} valor={null} aoEscolher={vi.fn()} />)

    const grupo = screen.getByRole('group', { name: 'Uniforme do evento' })
    const radios = within(grupo).getAllByRole('radio')
    expect(radios.map((r) => r.closest('label')?.textContent)).toEqual(['Uniforme de gala', 'Uniforme de campo'])
    expect(radios.some((r) => (r as HTMLInputElement).checked)).toBe(false)
    expect(new Set(radios.map((r) => r.getAttribute('name'))).size).toBe(1)
  })

  it('marca a opção do valor e devolve o valor de quem foi tocado', async () => {
    const aoEscolher = vi.fn()
    const { rerender } = render(<EscolhaUnica legenda="Uniforme do evento" opcoes={OPCOES} valor="GALA" aoEscolher={aoEscolher} />)
    expect(screen.getByLabelText('Uniforme de gala')).toBeChecked()

    await userEvent.click(screen.getByLabelText('Uniforme de campo'))
    expect(aoEscolher).toHaveBeenCalledWith('CAMPO')

    rerender(<EscolhaUnica legenda="Uniforme do evento" opcoes={OPCOES} valor="CAMPO" aoEscolher={aoEscolher} />)
    expect(screen.getByLabelText('Uniforme de campo')).toBeChecked()
    expect(screen.getByLabelText('Uniforme de gala')).not.toBeChecked()
  })

  it('cada opção é um alvo de toque de 44 px, em toda a linha', () => {
    render(<EscolhaUnica legenda="Uniforme do evento" opcoes={OPCOES} valor={null} aoEscolher={vi.fn()} />)
    for (const opcao of OPCOES) {
      expect(screen.getByLabelText(opcao.rotulo).closest('label')?.className).toContain('min-h-[var(--touch-min)]')
    }
  })

  it('o erro é anunciado, ligado ao grupo e marcado para o resumo de erros', () => {
    render(<EscolhaUnica id="uniforme" legenda="Uniforme do evento" opcoes={OPCOES} valor={null} erro="Escolha o uniforme do evento." aoEscolher={vi.fn()} />)

    const grupo = screen.getByRole('group', { name: 'Uniforme do evento' })
    expect(grupo).toHaveAttribute('id', 'uniforme')
    expect(grupo).toHaveAttribute('data-com-erro')
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('Escolha o uniforme do evento.')
    expect(grupo.getAttribute('aria-describedby')).toContain(alerta.id)
  })

  it('sem erro, não marca o grupo nem anuncia nada; a ajuda descreve o grupo', () => {
    render(<EscolhaUnica legenda="Uniforme do evento" opcoes={OPCOES} valor={null} ajuda="Confira a lista depois." aoEscolher={vi.fn()} />)

    const grupo = screen.getByRole('group', { name: 'Uniforme do evento' })
    expect(grupo).not.toHaveAttribute('data-com-erro')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(grupo).toHaveAccessibleDescription('Confira a lista depois.')
  })

  it('no formulário, o erro leva o foco ao primeiro rádio e entra no resumo', async () => {
    function Formulario() {
      const [erros, definir] = useState<Record<string, string>>({})
      const { formulario, pendencias } = useErrosAVista(erros)
      return (
        <form ref={formulario} onSubmit={(e) => { e.preventDefault(); definir({ uniforme: 'Escolha o uniforme do evento.' }) }}>
          <ResumoDosErros pendencias={pendencias} />
          <EscolhaUnica id="uniforme" legenda="Uniforme do evento" opcoes={OPCOES} valor={null} erro={erros['uniforme']} aoEscolher={vi.fn()} />
          <button type="submit">Salvar</button>
        </form>
      )
    }
    render(<Formulario />)

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(screen.getByLabelText('Uniforme de gala')).toHaveFocus()
    const resumo = screen.getByRole('region', { name: 'Revise 1 campo para salvar' })
    expect(within(resumo).getByRole('link', { name: 'Uniforme do evento' })).toBeInTheDocument()
  })
})
