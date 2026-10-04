import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { simularLargura } from '../testes/midia'
import { Campo } from './Campo'
import { ResumoDosErros, useErrosAVista } from './ErrosDoFormulario'
import { RodapeDoFormulario } from './RodapeDoFormulario'

const RESUMO = /^Revise \d+ campos? para salvar$/

function FormularioDeTeste({ errosAoSalvar }: { errosAoSalvar: Record<string, string> }) {
  const [erros, setErros] = useState<Record<string, string>>({})
  const { formulario, pendencias } = useErrosAVista(erros)
  const salvar = (evento: FormEvent) => {
    evento.preventDefault()
    setErros({ ...errosAoSalvar })
  }
  return (
    <MemoryRouter>
      <form ref={formulario} noValidate onSubmit={salvar}>
        <ResumoDosErros pendencias={pendencias} />
        <Campo rotulo="Apelido" />
        <Campo rotulo="Nome" erro={erros['nome']} />
        <fieldset id="grupo-de-teste" data-com-erro={erros['grupo'] ? true : undefined}>
          <legend>Dias</legend>
          <input type="checkbox" aria-label="Sábado" />
        </fieldset>
        <Campo rotulo="E-mail" erro={erros['email']} />
        <RodapeDoFormulario cancelar={{ para: '/' }} salvando={false} />
      </form>
    </MemoryRouter>
  )
}

describe('Erro à vista no formulário', () => {
  it('sem erro, não há resumo', () => {
    render(<FormularioDeTeste errosAoSalvar={{}} />)
    expect(screen.queryByRole('region', { name: RESUMO })).not.toBeInTheDocument()
  })

  it('ao falhar, foca o primeiro campo com erro e resume com um link por campo, na ordem da tela', async () => {
    render(<FormularioDeTeste errosAoSalvar={{ email: 'Informe o e-mail', nome: 'Informe o nome' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(screen.getByLabelText('Nome')).toHaveFocus()
    const resumo = screen.getByRole('region', { name: /Revise 2 campos para salvar/ })
    expect(within(resumo).getAllByRole('link').map((link) => link.textContent)).toEqual(['Nome', 'E-mail'])
  })

  it('o resumo não é um alerta: só o erro de cada campo se anuncia, sem disputar com o foco', async () => {
    render(<FormularioDeTeste errosAoSalvar={{ email: 'Informe o e-mail', nome: 'Informe o nome' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(screen.getAllByRole('alert').map((alerta) => alerta.textContent)).toEqual(['Informe o nome', 'Informe o e-mail'])
  })

  it('o título não fala em falta: o erro pode ser de valor, não de campo vazio', async () => {
    render(<FormularioDeTeste errosAoSalvar={{ nome: 'O fim vem antes do início' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('region', { name: 'Revise 1 campo para salvar' })).toBeInTheDocument()
  })

  it('o link leva ao campo', async () => {
    render(<FormularioDeTeste errosAoSalvar={{ email: 'Informe o e-mail', nome: 'Informe o nome' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await userEvent.click(screen.getByRole('link', { name: 'E-mail' }))
    expect(screen.getByLabelText('E-mail')).toHaveFocus()
  })

  it('um erro só fala no singular; grupo de caixas entra pela legenda e o foco vai à primeira caixa', async () => {
    render(<FormularioDeTeste errosAoSalvar={{ grupo: 'Marque um dia' }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(screen.getByLabelText('Sábado')).toHaveFocus()
    const resumo = screen.getByRole('region', { name: /Revise 1 campo para salvar/ })
    expect(within(resumo).getByRole('link', { name: 'Dias' })).toHaveAttribute('href', '#grupo-de-teste')
  })

  it('corrigido e salvo de novo, o resumo some', async () => {
    let erros: Record<string, string> = { nome: 'Informe o nome' }
    const { rerender } = render(<FormularioDeTeste errosAoSalvar={erros} />)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('region', { name: RESUMO })).toBeInTheDocument()

    erros = {}
    rerender(<FormularioDeTeste errosAoSalvar={erros} />)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.queryByRole('region', { name: RESUMO })).not.toBeInTheDocument()
  })
})

describe('Rodapé do formulário', () => {
  it('no computador, fica no fluxo do formulário', () => {
    render(<FormularioDeTeste errosAoSalvar={{}} />)
    expect(screen.getByRole('button', { name: 'Salvar' }).parentElement).not.toHaveClass('fixed')
  })

  it('no celular, fica fixo no pé com Cancelar e Salvar lado a lado, e reserva espaço para o último campo', () => {
    simularLargura(390)
    render(<FormularioDeTeste errosAoSalvar={{}} />)
    const barra = screen.getByRole('button', { name: 'Salvar' }).parentElement
    expect(barra).toHaveClass('fixed', 'bottom-0')
    expect([...(barra?.children ?? [])].map((filho) => filho.textContent)).toEqual(['Cancelar', 'Salvar'])
    expect(barra?.previousElementSibling).toHaveAttribute('data-espaco-do-rodape')
  })
})
