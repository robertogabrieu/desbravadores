import { z } from 'zod'
import { Horario } from '../enums'
import { RefClasse } from './auth'
import { DataCivil, Uuid } from './comum'

export const ClasseDoInstrutor = z.object({
  classe: RefClasse,
  totalDbvs: z.number().int(),
  progressoMedio: z.number().int().nullable(),
  proximaAula: z.object({ aulaId: Uuid, data: DataCivil, horario: Horario.nullable(), titulo: z.string().nullable(), totalRequisitos: z.number().int() }).nullable(),
  aulaHoje: z.boolean(),
  aulaHojeRegistrada: z.boolean(),
  aulasDadas: z.number().int(),   // RegistroAula no ano do clube
  /** Tarefas para casa: itens ativos distintos com alguém devendo e desbravadores distintos, sem a própria ficha; null = nada. */
  paraCobrar: z.object({ requisitos: z.number().int(), especialidades: z.number().int(), desbravadores: z.number().int() }).nullable(),
})
export const InicioInstrutorSaida = z.object({
  classes: z.array(ClasseDoInstrutor), // individuais por ordem, depois Agrupadas
  /** DBVs que faltaram às 2 últimas aulas registradas da classe. */
  alertaFaltas: z.array(z.object({ classe: RefClasse, dbvs: z.array(z.object({ dbvId: Uuid, nome: z.string() })) })),
})
// GET /inicio/instrutor → InicioInstrutorSaida · POST /classes/:id/pedir-liberacao → 204
