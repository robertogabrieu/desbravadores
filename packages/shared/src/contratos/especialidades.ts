import { z } from 'zod'
import { Origem } from '../enums'
import { DataCivil, TextoCurto, Uuid } from './comum'

export const EspecialidadeFiltro = z.object({ areaId: Uuid.optional(), busca: z.string().trim().max(60).optional() })
export const AreaComEspecialidades = z.object({
  id: Uuid, codigo: z.string(), nome: z.string(), ordem: z.number().int(),
  especialidades: z.array(z.object({ id: Uuid, nome: z.string(), origem: Origem })),
})
// GET /especialidades → AreaComEspecialidades[] (sem paginação; áreas por ordem, itens por nome)

export const EspecialidadesDoDbvSaida = z.object({
  dbvId: Uuid,
  concluidas: z.array(z.object({
    especialidadeId: Uuid, concluidaEm: DataCivil, marcadoPor: z.string(), podeDesmarcar: z.boolean(),
  })),
})
export const EspecialidadeClubeEntrada = z.object({ areaId: Uuid, nome: TextoCurto })
// GET /desbravadores/:id/especialidades → EspecialidadesDoDbvSaida
// PUT /desbravadores/:id/especialidades/:especialidadeId {concluidoEm} → EspecialidadesDoDbvSaida · DELETE → idem
// POST /especialidades {EspecialidadeClubeEntrada} (Fase 3) → AreaComEspecialidades[]
