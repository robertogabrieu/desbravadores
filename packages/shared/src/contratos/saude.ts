import { z } from 'zod'

export const SaudeSaida = z.object({ ok: z.boolean(), versao: z.string(), banco: z.boolean() })
