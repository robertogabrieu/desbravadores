import { z } from 'zod'
import { MesCivil } from '../enums'
import { RefClasse } from './auth'
import { DesbravadorSaida } from './desbravadores'

export const PerfilDbvSaida = z.object({
  dbv: DesbravadorSaida,              // `contato` só com dbv.ver_contato (regra da Fase 0)
  mes: MesCivil,
  posicaoMes: z.number().int().nullable(),
  pontosMes: z.number().int(),
  frequenciaMes: z.number().int().nullable(),
  classesInvestidas: z.array(z.object({ classe: RefClasse, anoClube: z.number().int() })),
})
// GET /api/desbravadores/:id/perfil → PerfilDbvSaida
