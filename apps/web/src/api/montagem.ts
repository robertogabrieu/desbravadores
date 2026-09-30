import {
  ConfiguracaoClubeSaida,
  MontagemSaida,
  type AulaCriarEntrada,
  type AulaEditarEntrada,
  type CronogramaCriarEntrada,
} from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { montarConsulta, requisitar } from './cliente'

export type Montagem = z.infer<typeof MontagemSaida>
export type DataDaMontagem = Montagem['datas'][number]
export type RequisitoDaMontagem = Montagem['requisitos'][number]
export type CronogramaDaMontagem = NonNullable<Montagem['cronograma']>

export const chavesMontagem = {
  /** `ano` indefinido = o ano corrente do clube, escolhido pela API. */
  da: (classeId: string, ano: number | undefined) => ['montagem', classeId, ano ?? null] as const,
  configuracao: ['clube', 'configuracao'] as const,
}

/** Sem repetição automática: 403 (instrutor que não monta) e 404 são respostas, não falhas passageiras. `ativa: false` não busca (sem conexão). */
export function useMontagem(classeId: string | undefined, ano: number | undefined, ativa = true) {
  return useQuery({
    queryKey: chavesMontagem.da(classeId ?? '', ano),
    queryFn: () =>
      requisitar(`/api/classes/${classeId ?? ''}/cronograma/montagem${montarConsulta({ anoClube: ano })}`, MontagemSaida),
    enabled: ativa && classeId !== undefined,
    retry: false,
    staleTime: 0,
  })
}

/** Dia/mês em que o ano do clube começa ("MM-DD"); só o Adm lê (usado no período padrão do cronograma novo). */
export function useInicioAnoClube(ativa = true) {
  return useQuery({
    queryKey: chavesMontagem.configuracao,
    queryFn: () => requisitar('/api/clube/configuracao', ConfiguracaoClubeSaida),
    enabled: ativa,
    select: (configuracao) => configuracao.inicioAnoClube,
  })
}

/** Toda gravação de montagem devolve a `MontagemSaida` nova: ela substitui o que a tela guardava. */
function useGravacao<E>(classeId: string, ano: number | undefined, chamar: (entrada: E) => Promise<Montagem>) {
  const clienteConsultas = useQueryClient()
  return useMutation({
    mutationFn: chamar,
    onSuccess: (saida) => clienteConsultas.setQueryData(chavesMontagem.da(classeId, ano), saida),
  })
}

const corpo = (metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE', dados?: unknown) => ({ metodo, corpo: dados })

export function useCriarCronograma(classeId: string, ano: number) {
  return useGravacao(classeId, ano, (entrada: z.infer<typeof CronogramaCriarEntrada>) =>
    requisitar('/api/cronogramas', MontagemSaida, corpo('POST', entrada)),
  )
}

export function useColocarRequisito(classeId: string, ano: number | undefined, cronogramaId: string) {
  return useGravacao(classeId, ano, ({ requisitoId, data }: { requisitoId: string; data: string }) =>
    requisitar(`/api/cronogramas/${cronogramaId}/requisitos/${requisitoId}`, MontagemSaida, corpo('PUT', { data })),
  )
}

export function useTirarRequisito(classeId: string, ano: number | undefined, cronogramaId: string) {
  return useGravacao(classeId, ano, (requisitoId: string) =>
    requisitar(`/api/cronogramas/${cronogramaId}/requisitos/${requisitoId}`, MontagemSaida, corpo('DELETE')),
  )
}

export function useCriarAula(classeId: string, ano: number | undefined, cronogramaId: string) {
  return useGravacao(classeId, ano, (entrada: z.infer<typeof AulaCriarEntrada>) =>
    requisitar(`/api/cronogramas/${cronogramaId}/aulas`, MontagemSaida, corpo('POST', entrada)),
  )
}

export function useEditarAula(classeId: string, ano: number | undefined) {
  return useGravacao(classeId, ano, ({ aulaId, ...dados }: { aulaId: string } & z.infer<typeof AulaEditarEntrada>) =>
    requisitar(`/api/aulas-planejadas/${aulaId}`, MontagemSaida, corpo('PATCH', dados)),
  )
}

/** `enviar` (instrutor) e `publicar` (Adm) levam o `atualizadoEm` que a tela viu. */
export function useEnviarOuPublicar(classeId: string, ano: number | undefined, cronogramaId: string, acao: 'enviar' | 'publicar') {
  return useGravacao(classeId, ano, (atualizadoEmVisto: string) =>
    requisitar(`/api/cronogramas/${cronogramaId}/${acao}`, MontagemSaida, corpo('POST', { atualizadoEmVisto })),
  )
}
