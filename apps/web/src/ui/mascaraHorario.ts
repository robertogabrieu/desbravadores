const HORARIO_COMPLETO = /^([01]\d|2[0-3]):[0-5]\d$/

/** Mantém só os dígitos (até 4) e põe ":" depois do segundo; ao apagar, não recoloca o ":" que sobrou no fim. */
export function mascararHorario(texto: string, apagando = false): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 4)
  if (digitos.length < 2 || (digitos.length === 2 && apagando)) return digitos
  return `${digitos.slice(0, 2)}:${digitos.slice(2)}`
}

/** `HH:MM` completo, hora 00–23 e minuto 00–59. */
export const horarioValido = (valor: string): boolean => HORARIO_COMPLETO.test(valor)
