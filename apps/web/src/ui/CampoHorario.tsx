import { Campo } from './Campo'
import { horarioValido, mascararHorario } from './mascaraHorario'
import type { ChangeEvent, ComponentProps } from 'react'

type Propriedades = Omit<ComponentProps<typeof Campo>, 'type' | 'inputMode' | 'maxLength' | 'placeholder'>

/** Campo de horário com máscara `HH:MM`: o valor entregue a `onChange` já vem mascarado, no mesmo formato do antigo seletor nativo. */
export function CampoHorario({ onChange, erro, value, ...resto }: Propriedades) {
  const aoMudar = (evento: ChangeEvent<HTMLInputElement>) => {
    const tipoDeEntrada = (evento.nativeEvent as InputEvent).inputType ?? ''
    evento.target.value = mascararHorario(evento.target.value, tipoDeEntrada.startsWith('delete'))
    onChange?.(evento)
  }
  const texto = typeof value === 'string' ? value : ''
  const erroDoFormato = texto.length === 5 && !horarioValido(texto) ? 'Horário inválido' : undefined
  return (
    <Campo {...resto} type="text" inputMode="numeric" placeholder="00:00" maxLength={5} autoComplete="off" value={value} erro={erro ?? erroDoFormato} onChange={aoMudar} />
  )
}
