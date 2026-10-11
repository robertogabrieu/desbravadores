import { useState } from 'react'
import { Campo } from './Campo'
import { editarHorario, horarioValido } from './mascaraHorario'
import type { ChangeEvent, ComponentProps } from 'react'

type Propriedades = Omit<ComponentProps<typeof Campo>, 'type' | 'inputMode' | 'placeholder'>

/** Campo de horário com máscara `HH:MM`: o valor entregue a `onChange` já vem mascarado, no mesmo formato do antigo seletor nativo. */
export function CampoHorario({ onChange, onBlur, erro, value, ...resto }: Propriedades) {
  const [saiu, setSaiu] = useState(false)
  const aoMudar = (evento: ChangeEvent<HTMLInputElement>) => {
    const campo = evento.target
    const nativo = evento.nativeEvent as InputEvent
    const { texto, cursor } = editarHorario(campo.value, campo.selectionStart ?? campo.value.length, nativo.inputType, nativo.data)
    campo.value = texto
    setSaiu(false)
    onChange?.(evento)
    campo.setSelectionRange(cursor, cursor)
  }
  const texto = typeof value === 'string' ? value : ''
  const formatoRuim = texto.length === 5 ? !horarioValido(texto) : texto !== '' && saiu
  return (
    <Campo
      {...resto}
      type="text"
      inputMode="numeric"
      placeholder="00:00"
      autoComplete="off"
      value={value}
      erro={erro ?? (formatoRuim ? 'Horário inválido' : undefined)}
      onChange={aoMudar}
      onBlur={(evento) => {
        setSaiu(true)
        onBlur?.(evento)
      }}
    />
  )
}
