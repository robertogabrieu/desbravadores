import { z } from 'zod'
import { Origem } from '../enums'
import { Uuid } from './comum'

export const EspecialidadeFiltro = z.object({ areaId: Uuid.optional(), busca: z.string().trim().max(60).optional() })
export const AreaComEspecialidades = z.object({
  id: Uuid, codigo: z.string(), nome: z.string(), ordem: z.number().int(),
  especialidades: z.array(z.object({ id: Uuid, nome: z.string(), origem: Origem })),
})
// GET /especialidades → AreaComEspecialidades[] (sem paginação; áreas por ordem, itens por nome)

