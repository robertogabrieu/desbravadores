import { z } from 'zod'
import { MesCivil } from '../enums'
import { Uuid } from './comum'
import { RefClasse, RefUnidade } from './auth'

export const RankingFiltro = z.object({
  mes: MesCivil.optional(),  // padrão: mês corrente no fuso do clube
  unidadeId: Uuid.optional(),
})
export const RankingItem = z.object({
  posicao: z.number().int(),
  dbvId: Uuid,
  /** Nome completo para ADM e para DBVs no escopo de quem pede; senão `nomePublico` ("Ana C."). */
  nome: z.string(),
  unidade: RefUnidade.nullable(),
  classe: RefClasse.nullable(),
  pontos: z.number().int(),
  /** Só para DBVs no escopo de quem pede (senão null). */
  frequencia: z.number().int().nullable(),
  /** true = quem pede pode abrir o perfil (está no escopo dele). */
  abrePerfil: z.boolean(),
})
export const RankingSaida = z.object({ mes: MesCivil, itens: z.array(RankingItem) })
export const RankingUnidadesSaida = z.array(z.object({
  posicao: z.number().int(), unidade: RefUnidade, mediaPontos: z.number(), totalDbvs: z.number().int(),
}))
// GET /api/ranking?mes&unidadeId → RankingSaida · GET /api/ranking/unidades?mes → RankingUnidadesSaida
