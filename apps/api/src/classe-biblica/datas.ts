import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import type { TipoEvento } from '../generated/prisma/client.js'

/** Tipos de evento que desmarcam a data (regra 4) e fazem a data nova avisar (regra 7), com o rótulo do calendário. */
export const ROTULO_DO_IMPEDIMENTO: Partial<Record<TipoEvento, string>> = { FERIAS: 'Férias', FERIADO: 'Feriado', SEM_REUNIAO: 'Sem reunião' }
export const TIPOS_QUE_IMPEDEM = Object.keys(ROTULO_DO_IMPEDIMENTO) as TipoEvento[]

export function somarDias(data: string, dias: number): string {
  return paraDataCivil(new Date(daDataCivil(data).getTime() + dias * 86_400_000))
}
