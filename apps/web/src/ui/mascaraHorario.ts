import { editarComMascara } from './mascaraData'
import type { Mascara } from './mascaraData'

const HORARIO_COMPLETO = /^([01]\d|2[0-3]):[0-5]\d$/

/** Dígitos (até 4) em HH:MM; ao apagar, não recoloca o ":" que sobrou no fim. */
function formatarHorario(digitos: string, apagando: boolean): string {
  if (digitos.length < 2 || (digitos.length === 2 && apagando)) return digitos
  return `${digitos.slice(0, 2)}:${digitos.slice(2)}`
}

const MASCARA_HORARIO: Mascara = { separador: ':', maxDigitos: 4, fimDeBlocoComUmDigito: [1], formatar: formatarHorario }

/** Mantém só os dígitos (até 4) e põe ":" depois do segundo. Nunca completa com zero. */
export function mascararHorario(texto: string, apagando = false): string {
  return formatarHorario(texto.replace(/\D/g, '').slice(0, 4), apagando)
}

/** Edição de um campo de horário: texto mascarado e posição do cursor. ":" digitado após 1 dígito de hora completa com zero ("8:" → "08:"). */
export function editarHorario(bruto: string, cursorBruto: number, inputType = '', dado: string | null = null) {
  return editarComMascara(MASCARA_HORARIO, bruto, cursorBruto, inputType, dado)
}

/** `HH:MM` completo, hora 00–23 e minuto 00–59. */
export const horarioValido = (valor: string): boolean => HORARIO_COMPLETO.test(valor)
