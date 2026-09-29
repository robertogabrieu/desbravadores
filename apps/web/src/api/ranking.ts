import { RankingSaida, RankingUnidadesSaida } from '@desbravadores/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { z } from 'zod'
import { montarConsulta, requisitar } from './cliente'

export type Ranking = z.infer<typeof RankingSaida>
export type ItemRanking = Ranking['itens'][number]
export type RankingUnidades = z.infer<typeof RankingUnidadesSaida>

/** A raiz `ranking` é invalidada pelo envio de chamadas (`aoEnviar` do tipo REUNIAO). */
export const chavesRanking = {
  mes: (mes: string | undefined, unidadeId: string | undefined) => ['ranking', 'mes', mes ?? null, unidadeId ?? null] as const,
  unidades: (mes: string | undefined) => ['ranking', 'unidades', mes ?? null] as const,
}

/** `mes` no formato AAAA-MM; sem ele a API usa o mês corrente no fuso do clube. */
export function useRanking(mes: string | undefined, unidadeId: string | undefined) {
  return useQuery({
    queryKey: chavesRanking.mes(mes, unidadeId),
    queryFn: () => requisitar(`/api/ranking${montarConsulta({ mes, unidadeId })}`, RankingSaida),
    placeholderData: keepPreviousData,
  })
}

export function useRankingUnidades(mes: string | undefined) {
  return useQuery({
    queryKey: chavesRanking.unidades(mes),
    queryFn: () => requisitar(`/api/ranking/unidades${montarConsulta({ mes })}`, RankingUnidadesSaida),
  })
}
