import { z } from 'zod'
import { RefClasse } from './auth'
import { InstanteIso, Uuid } from './comum'

export const AtividadeSaida = z.object({ id: Uuid, descricao: z.string(), link: z.string().nullable(), criadaEm: InstanteIso, autor: z.string().nullable() })
export const VisaoGeralSaida = z.object({
  dbvsAtivos: z.number().int(),
  variacaoTrimestre: z.number().int(),        // ativos hoje − ativos há 3 meses
  unidades: z.number().int(),
  instrutores: z.number().int(),
  classesCobertas: z.number().int(),           // classes ativas com pelo menos um instrutor
  frequenciaMes: z.number().int().nullable(),
  variacaoFrequencia: z.number().int().nullable(), // pontos percentuais vs mês anterior
  especialidadesAno: z.number().int(),
  especialidadesPorDbv: z.number(),
  progressoClasses: z.array(z.object({ classe: RefClasse, media: z.number().int().nullable(), totalDbvs: z.number().int(), instrutores: z.array(z.string()) })),
  unidadesResumo: z.array(z.object({ id: Uuid, nome: z.string(), conselheiros: z.array(z.string()), totalDbvs: z.number().int(), frequenciaMes: z.number().int().nullable() })),
  cronogramasEnviados: z.array(z.object({ cronogramaId: Uuid, classe: RefClasse, enviadoPor: z.string(), enviadoEm: InstanteIso })),
  atividades: z.array(AtividadeSaida).max(10),
})
// GET /visao-geral → VisaoGeralSaida
