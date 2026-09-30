import { hojeNoFuso } from '@desbravadores/shared'

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DIA_MS = 86_400_000

export function dataCurta(data: string): string {
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

export const diaDaSemana = (data: string): string => DIAS[new Date(`${data}T12:00:00Z`).getUTCDay()] ?? ''

export function somarDias(data: string, dias: number): string {
  return new Date(Date.parse(`${data}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10)
}

function horaNoFuso(instante: number, fuso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hour12: false }).format(instante)
}

export function listaAtualizada(baixadoEm: number | null, fuso: string): string | null {
  if (baixadoEm === null) return null
  const dia = hojeNoFuso(fuso, new Date(baixadoEm)) === hojeNoFuso(fuso, new Date()) ? 'hoje' : dataCurta(hojeNoFuso(fuso, new Date(baixadoEm)))
  return `Lista atualizada ${dia} às ${horaNoFuso(baixadoEm, fuso)}`
}
