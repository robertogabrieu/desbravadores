import { z } from 'zod'
import { Horario, TipoEvento } from '../enums'
import { RefClasse } from './auth'
import { DataCivil, TextoCurto, Uuid } from './comum'

export const EventoEntrada = z
  .object({
    nome: TextoCurto,
    tipo: TipoEvento,
    inicio: DataCivil,
    fim: DataCivil,
    horario: Horario.nullable(),
    local: z.string().trim().max(120).nullable(),
    cancelaReuniao: z.boolean(),
    bloqueiaAula: z.boolean(),
    bomParaCampo: z.boolean(),
  })
  .refine((e) => e.fim >= e.inicio, { message: 'O fim não pode ser antes do início', path: ['fim'] })
export const EventoSaida = z.object({
  id: Uuid, nome: z.string(), tipo: TipoEvento, inicio: DataCivil, fim: DataCivil,
  horario: Horario.nullable(), local: z.string().nullable(),
  cancelaReuniao: z.boolean(), bloqueiaAula: z.boolean(), bomParaCampo: z.boolean(),
})
export const CalendarioFiltro = z.object({ ano: z.coerce.number().int().min(2000).max(2100) })
export const CalendarioSaida = z.object({
  eventos: z.array(EventoSaida),          // que tocam o ano, ordem por início
  diasDeReuniao: z.array(DataCivil),      // implícitos no ano, já sem os cancelados
})
export const AulaAfetada = z.object({ aulaId: Uuid, cronogramaId: Uuid, classe: RefClasse, data: DataCivil })
/** Resposta de POST /calendario/eventos e PATCH /calendario/eventos/:id. */
export const EventoGravadoSaida = z.object({ evento: EventoSaida, aulasAfetadas: z.array(AulaAfetada) })
// DELETE /calendario/eventos/:id → 204
