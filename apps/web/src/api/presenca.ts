import {
  ConclusaoEntrada,
  ConclusaoSaida,
  LinhaDePresenca,
  MarcaDePresenca,
  PresencaDoEventoEntrada,
  PresencaDoEventoResposta,
  PresencaDoEventoSaida,
  ResumoDaPresenca,
  UnidadeDaPresenca,
} from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { chavesCalendario } from './calendario'
import { requisitar } from './cliente'
import { chavesVisaoGeral } from './visao-geral'

export type Presenca = z.infer<typeof PresencaDoEventoSaida>
export type UnidadeDaPresenca = z.infer<typeof UnidadeDaPresenca>
export type LinhaDaPresenca = z.infer<typeof LinhaDePresenca>
export type ResumoDaPresenca = z.infer<typeof ResumoDaPresenca>
export type MarcaParaGravar = z.input<typeof MarcaDePresenca>
export type RespostaDaGravacao = z.infer<typeof PresencaDoEventoResposta>
export type Conclusao = z.infer<typeof ConclusaoSaida>

/** Fora da raiz `calendario`: gravar a lista invalida o calendário, e isso não pode refazer a leitura da lista a cada toque. */
export const chavesPresenca = {
  evento: (eventoId: string) => ['presenca', eventoId] as const,
}

const caminho = (eventoId: string) => `/api/calendario/eventos/${eventoId}/presenca`

export function usePresenca(eventoId: string) {
  return useQuery({
    queryKey: chavesPresenca.evento(eventoId),
    queryFn: () => requisitar(caminho(eventoId), PresencaDoEventoSaida),
    // Ao voltar para a aba, outro Adm pode ter marcado: lê de novo mesmo com o dado "fresco".
    refetchOnWindowFocus: 'always',
  })
}

export function gravarPresenca(eventoId: string, marcas: MarcaParaGravar[]): Promise<RespostaDaGravacao> {
  return requisitar(caminho(eventoId), PresencaDoEventoResposta, { metodo: 'PUT', corpo: PresencaDoEventoEntrada.parse({ marcas }) })
}

/**
 * Pontos e resumos que dependem da lista. Só as consultas que não estão na tela são refeitas agora: as
 * outras são marcadas e refeitas quando alguém voltar a elas.
 */
export function invalidarDepoisDaLista(cliente: QueryClient): Promise<void> {
  const opcoes = { refetchType: 'inactive' } as const
  return Promise.all([
    cliente.invalidateQueries({ queryKey: chavesCalendario.todas, ...opcoes }),
    cliente.invalidateQueries({ queryKey: chavesVisaoGeral.todas, ...opcoes }),
    cliente.invalidateQueries({ queryKey: ['ranking'], ...opcoes }),
  ]).then(() => undefined)
}

export function useConcluirLista(eventoId: string) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (totais: z.input<typeof ConclusaoEntrada>) =>
      requisitar(`${caminho(eventoId)}/concluir`, ConclusaoSaida, { metodo: 'POST', corpo: ConclusaoEntrada.parse(totais) }),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: chavesPresenca.evento(eventoId) })
      await invalidarDepoisDaLista(cliente)
    },
  })
}
