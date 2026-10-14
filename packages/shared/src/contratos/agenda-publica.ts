import { z } from 'zod'
import { Horario, TIPOS_EVENTO, UniformeEvento } from '../enums'
import { DataCivil, TextoCurto } from './comum'

/** O tipo do calendário, mais `REUNIAO` para a reunião semanal (calculada pela configuração do clube). */
export const TipoDeCompromissoPublico = z.enum([...TIPOS_EVENTO, 'REUNIAO'])

/** `.strict()`: o contrato público não aceita campo de fora (pontos, lista, ids, pessoas). */
export const CompromissoPublico = z
  .object({
    data: DataCivil,
    fim: DataCivil.optional(),
    nome: TextoCurto,
    tipo: TipoDeCompromissoPublico,
    horario: Horario.nullable(),
    local: z.string().nullable(),
    uniforme: UniformeEvento.nullable(),
  })
  .strict()

export const AgendaPublicaSaida = z
  .object({
    clube: z.object({ nome: z.string() }).strict(),
    hoje: DataCivil,
    compromissos: z.array(CompromissoPublico),
  })
  .strict()
export type AgendaPublicaSaida = z.infer<typeof AgendaPublicaSaida>
export type CompromissoPublico = z.infer<typeof CompromissoPublico>
