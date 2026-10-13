import { RegraEntrada, RegraSaida, RegrasSaida } from '@desbravadores/shared'
import type { GatilhoDeRegra } from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { requisitar } from './cliente'

export type RegrasDaTela = z.infer<typeof RegrasSaida>
export type RegraDoClube = z.infer<typeof RegraSaida>
export type EventoDaTela = RegrasDaTela['eventos'][number]
export type EdicaoDaRegra = z.input<typeof RegraEntrada> & { gatilho: GatilhoDeRegra }

export const chavesRegras = { lista: ['ranking', 'regras'] as const }

export function useRegras() {
  return useQuery({
    queryKey: chavesRegras.lista,
    queryFn: () => requisitar('/api/ranking/regras', RegrasSaida),
  })
}

/** Grava pontos e liga/desliga de uma regra; a lista em cache já recebe o valor novo, sem esperar nova leitura. */
export function useSalvarRegra() {
  const cliente = useQueryClient()
  return useMutation({
    // Sem isto o react-query pausa a mutação com o navegador offline e o Salvar fica pendente sem erro.
    networkMode: 'always',
    mutationFn: ({ gatilho, ...entrada }: EdicaoDaRegra) =>
      requisitar(`/api/ranking/regras/${gatilho}`, RegraSaida, { metodo: 'PATCH', corpo: RegraEntrada.parse(entrada) }),
    onSuccess: (salva) => {
      cliente.setQueryData<RegrasDaTela>(chavesRegras.lista, (atual) =>
        atual && { ...atual, regras: atual.regras.map((regra) => (regra.gatilho === salva.gatilho ? salva : regra)) },
      )
      return cliente.invalidateQueries({ queryKey: chavesRegras.lista })
    },
  })
}
