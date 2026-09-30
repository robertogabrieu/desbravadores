import { ConfiguracaoClubeEntrada, ConfiguracaoClubeSaida } from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { requisitar } from './cliente'

export type ConfiguracaoClube = z.infer<typeof ConfiguracaoClubeSaida>
export type EdicaoConfiguracao = z.input<typeof ConfiguracaoClubeEntrada>

export const chavesClube = { configuracao: ['clube', 'configuracao'] as const }

export function useConfiguracaoClube() {
  return useQuery({
    queryKey: chavesClube.configuracao,
    queryFn: () => requisitar('/api/clube/configuracao', ConfiguracaoClubeSaida),
  })
}

export function useSalvarConfiguracao() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (entrada: EdicaoConfiguracao) =>
      requisitar('/api/clube/configuracao', ConfiguracaoClubeSaida, { metodo: 'PATCH', corpo: ConfiguracaoClubeEntrada.parse(entrada) }),
    onSuccess: (salva) => cliente.setQueryData(chavesClube.configuracao, salva),
  })
}
