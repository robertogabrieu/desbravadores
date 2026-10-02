import { z } from 'zod'
import { Horario } from '../enums'
import { DataCivil, Uuid } from './comum'
import { RefUnidade } from './auth'

export const InicioConselheiroFiltro = z.object({ unidadeId: Uuid.optional() })
/**
 * Conselheiro sem unidade: `unidade` e `proximaReuniao` null, `unidades` vazio (tela mostra vazio).
 * `proximaReuniao` também é null sem reunião nos próximos 120 dias.
 */
export const InicioConselheiroSaida = z.object({
  unidade: RefUnidade.nullable(),
  unidades: z.array(RefUnidade), // todas as do conselheiro, para o seletor
  proximaReuniao: z.object({
    data: DataCivil, horario: Horario, local: z.string().nullable(),
    /** Nome da reunião extra que dá a reunião do dia; null num dia normal. */
    nome: z.string().nullable(),
    ehHoje: z.boolean(), chamadaFeita: z.boolean(),
  }).nullable(),
  /** Fim das férias em que cai o próximo dia normal sem reunião; null fora das férias e sem unidade. */
  feriasAte: DataCivil.nullable(),
  totalDbvs: z.number().int(),
  frequenciaMes: z.number().int().nullable(),
  posicaoUnidade: z.object({ posicao: z.number().int(), total: z.number().int() }).nullable(),
  /** Top 3 do mês DA UNIDADE selecionada (posição dentro da unidade). */
  destaques: z.array(z.object({ posicao: z.number().int(), dbvId: Uuid, nome: z.string(), pontos: z.number().int() })).max(3),
})
// GET /api/inicio/conselheiro?unidadeId → InicioConselheiroSaida
