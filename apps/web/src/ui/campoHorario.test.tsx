import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CampoHorario } from './CampoHorario'
import { horarioValido, mascararHorario } from './mascaraHorario'

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

describe('CampoHorario', () => {
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
  it('tem teclado numérico e placeholder', () => {
    render(<Exemplo />)
    const campo = screen.getByLabelText('Horário')
    expect(campo).toHaveAttribute('inputmode', 'numeric')
    expect(campo).toHaveAttribute('placeholder', '00:00')
  })
})
