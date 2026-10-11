const HORARIO_COMPLETO = /^([01]\d|2[0-3]):[0-5]\d$/

/** Mantém só os dígitos (até 4) e põe ":" depois do segundo; ":" digitado após um dígito completa com zero ("8:" → "08:"); ao apagar, não recoloca o ":" que sobrou no fim. */
export function mascararHorario(texto: string, apagando = false): string {
  let digitos = ''
  for (const caractere of texto) {
    if (/\d/.test(caractere)) digitos = (digitos + caractere).slice(0, 4)
    else if (caractere === ':' && digitos.length === 1) digitos = `0${digitos}`
  }
  if (digitos.length < 2 || (digitos.length === 2 && apagando)) return digitos
  return `${digitos.slice(0, 2)}:${digitos.slice(2)}`
}

/** `HH:MM` completo, hora 00–23 e minuto 00–59. */
export const horarioValido = (valor: string): boolean => HORARIO_COMPLETO.test(valor)
