import { InicioConselheiroSaida } from '@desbravadores/shared'
import { useQuery } from '@tanstack/react-query'
import type { z } from 'zod'
import { montarConsulta, requisitar } from './cliente'

export type InicioConselheiro = z.infer<typeof InicioConselheiroSaida>

/** A raiz `inicio` é invalidada pelo envio de chamadas (`aoEnviar` do tipo REUNIAO). */
export const chavesInicio = {
  conselheiro: (unidadeId: string) => ['inicio', 'conselheiro', unidadeId] as const,
}

export function useInicioConselheiro(unidadeId: string) {
  return useQuery({
    queryKey: chavesInicio.conselheiro(unidadeId),
    queryFn: () => requisitar(`/api/inicio/conselheiro${montarConsulta({ unidadeId })}`, InicioConselheiroSaida),
  })
}
