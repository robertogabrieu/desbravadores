import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CampoHorario } from './CampoHorario'
import { editarHorario, horarioValido, mascararHorario } from './mascaraHorario'

describe('mascararHorario', () => {
  it('insere ":" depois de dois dígitos e ignora o que não é dígito', () => {
    expect(mascararHorario('1')).toBe('1')
    expect(mascararHorario('14')).toBe('14:')
    expect(mascararHorario('1430')).toBe('14:30')
    expect(mascararHorario('14a3b0')).toBe('14:30')
    expect(mascararHorario('143099')).toBe('14:30')
  })
  it('ao apagar, não trava no ":"', () => {
    expect(mascararHorario('14:', true)).toBe('14')
    expect(mascararHorario('14:3', true)).toBe('14:3')
    expect(mascararHorario('', true)).toBe('')
  })
  it('nunca completa com zero e ignora ":" digitado', () => {
    expect(mascararHorario('8:')).toBe('8')
    expect(mascararHorario('8:30')).toBe('83:0')
    expect(mascararHorario(':')).toBe('')
    expect(mascararHorario('14:30')).toBe('14:30')
  })
  it('aceita colar 14:30 inteiro', () => {
    expect(mascararHorario('14:30')).toBe('14:30')
  })
  it('valida hora 00-23 e minuto 00-59', () => {
    expect(horarioValido('14:30')).toBe(true)
    expect(horarioValido('00:00')).toBe(true)
    expect(horarioValido('23:59')).toBe(true)
    expect(horarioValido('24:00')).toBe(false)
    expect(horarioValido('12:60')).toBe(false)
    expect(horarioValido('14:3')).toBe(false)
    expect(horarioValido('')).toBe(false)
  })
})

function Exemplo() {
  const [valor, setValor] = useState('')
  return <CampoHorario rotulo="Horário" value={valor} onChange={(e) => setValor(e.target.value)} />
}

describe('editarHorario', () => {
  const digitar = (bruto: string, cursor: number, dado: string) => editarHorario(bruto, cursor, 'insertText', dado)

  it('":" depois de um dígito completa com zero e leva o cursor depois dos dois pontos', () => {
    expect(digitar('8:', 2, ':')).toEqual({ texto: '08:', cursor: 3 })
  })
  it('":" digitado em outro ponto é ignorado', () => {
    expect(digitar('14:', 3, ':')).toEqual({ texto: '14:', cursor: 3 })
    expect(digitar('1:2', 2, ':').texto).toBe('12:')
  })
  it('apagar um dígito do meio de valor cheio não completa com zero', () => {
    expect(editarHorario('2:30', 0, 'deleteContentBackward')).toEqual({ texto: '23:0', cursor: 0 })
    expect(editarHorario('1:30', 1, 'deleteContentBackward').texto).toBe('13:0')
  })
  it('redigitar no lugar do dígito apagado restaura o valor', () => {
    expect(digitar('12:30', 1, '1')).toEqual({ texto: '12:30', cursor: 1 })
    expect(digitar('12:30', 2, '2')).toEqual({ texto: '12:30', cursor: 3 })
  })
})

describe('CampoHorario', () => {
  it('cursor fica depois dos dois pontos após "1" + ":"', async () => {
    render(<Exemplo />)
    const campo = screen.getByLabelText<HTMLInputElement>('Horário')
    await userEvent.type(campo, '1:')
    expect(campo).toHaveValue('01:')
    expect(campo.selectionStart).toBe(3)
  })
  it('apagar o 1º dígito de 12:30 e redigitar restaura o valor, sem travar por tamanho', async () => {
    render(<Exemplo />)
    const campo = screen.getByLabelText<HTMLInputElement>('Horário')
    await userEvent.type(campo, '1230')
    campo.setSelectionRange(1, 1)
    await userEvent.keyboard('{Backspace}')
    expect(campo).toHaveValue('23:0')
    await userEvent.keyboard('1')
    expect(campo).toHaveValue('12:30')
    expect(campo.selectionStart).toBe(1)
  })

  it('digitar só números monta HH:MM e apagar funciona', async () => {
    render(<Exemplo />)
    const campo = screen.getByLabelText('Horário')
    await userEvent.type(campo, '1430')
    expect(campo).toHaveValue('14:30')
    await userEvent.type(campo, '{Backspace}{Backspace}')
    expect(campo).toHaveValue('14')
  })
  it('colar 14:30 mantém o valor', async () => {
    render(<Exemplo />)
    const campo = screen.getByLabelText('Horário')
    await userEvent.click(campo)
    await userEvent.paste('14:30')
    expect(campo).toHaveValue('14:30')
  })
  it('horário completo inválido mostra erro; válido não', () => {
    render(<Exemplo />)
    const campo = screen.getByLabelText('Horário')
    fireEvent.change(campo, { target: { value: '2400' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Horário inválido')
    fireEvent.change(campo, { target: { value: '2359' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('escrever "8:30" vira 08:30', async () => {
    render(<Exemplo />)
    const campo = screen.getByLabelText('Horário')
    await userEvent.type(campo, '8:30')
    expect(campo).toHaveValue('08:30')
  })
  it('horário incompleto mostra erro ao sair do campo e some ao completar', async () => {
    render(<Exemplo />)
    const campo = screen.getByLabelText('Horário')
    await userEvent.type(campo, '08:3')
    expect(screen.queryByRole('alert')).toBeNull()
    await userEvent.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('Horário inválido')
    await userEvent.type(campo, '0')
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('campo vazio ao sair não mostra erro', async () => {
    render(<Exemplo />)
    await userEvent.click(screen.getByLabelText('Horário'))
    await userEvent.tab()
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('inserir número no meio mantém o cursor onde estava', async () => {
    render(<Exemplo />)
    const campo = screen.getByLabelText<HTMLInputElement>('Horário')
    await userEvent.type(campo, '103')
    campo.setSelectionRange(1, 1)
    await userEvent.keyboard('2')
    expect(campo).toHaveValue('12:03')
    expect(campo.selectionStart).toBe(3)
  })
  it('tem teclado numérico e placeholder', () => {
    render(<Exemplo />)
    const campo = screen.getByLabelText('Horário')
    expect(campo).toHaveAttribute('inputmode', 'numeric')
    expect(campo).toHaveAttribute('placeholder', '00:00')
  })
})
