import {
  Aviso as AvisoContrato,
  DesbravadorCriarEntrada,
  DesbravadorEditarEntrada,
  DesbravadorFiltro,
  DesbravadorLista,
  DesbravadorSaida,
  InativarEntrada,
  MatriculaEntrada,
  MatriculaSaida,
  MoverUnidadeEntrada,
  comAvisos,
  hojeNoFuso,
} from '@desbravadores/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { montarConsulta, requisitar } from './cliente'
import { chavesPerfil } from './perfil'
import type { PerfilDbv } from './perfil'
import { chavesProgresso } from './progresso'
import { invalidarUnidades } from './unidades'

export type Desbravador = z.infer<typeof DesbravadorSaida>
export type ListaDesbravadores = z.infer<typeof DesbravadorLista>
export type Aviso = z.infer<typeof AvisoContrato>
export type NovoDesbravador = z.input<typeof DesbravadorCriarEntrada>
export type EdicaoDesbravador = z.input<typeof DesbravadorEditarEntrada>
export type SituacaoDesbravador = z.input<typeof DesbravadorFiltro>['ativo']
export type TipoDesbravador = Desbravador['tipo']

export interface FiltroDesbravadores {
  busca?: string
  unidadeId?: string
  semUnidade?: boolean
  classeId?: string
  ativo: SituacaoDesbravador
  tipo?: TipoDesbravador
  pagina: number
}

export const POR_PAGINA = 25
const FUSO_PADRAO = 'America/Sao_Paulo'

/** A sessão ainda não traz o fuso do clube: vale o de Brasília. */
export const hojeDoClube = (): string => hojeNoFuso(FUSO_PADRAO, new Date())

export const chavesDesbravadores = {
  todos: ['desbravadores'] as const,
  lista: (filtro: FiltroDesbravadores) => ['desbravadores', 'lista', filtro] as const,
  um: (id: string) => ['desbravadores', id] as const,
}

const lerDesbravador = (id: string) => requisitar(`/api/desbravadores/${id}`, DesbravadorSaida)

/** `habilitada: false` não consulta (a tela de cadastro novo não tem id). */
export function useDesbravador(id: string, habilitada = true) {
  return useQuery({
    queryKey: chavesDesbravadores.um(id),
    queryFn: () => lerDesbravador(id),
    enabled: habilitada,
  })
}

/** Ficha (perfil e progresso), listas e contagem das unidades mudam com qualquer gravação de desbravador. */
function aposGravar(cliente: QueryClient, gravado?: Desbravador): Promise<unknown> {
  if (gravado) {
    cliente.setQueryData(chavesDesbravadores.um(gravado.id), gravado)
    cliente.setQueryData(chavesPerfil.dbv(gravado.id), (atual: PerfilDbv | undefined) => (atual ? { ...atual, dbv: gravado } : atual))
  }
  return Promise.all([
    cliente.invalidateQueries({ queryKey: chavesDesbravadores.todos }),
    cliente.invalidateQueries({ queryKey: chavesPerfil.dbv('').slice(0, 1) }),
    cliente.invalidateQueries({ queryKey: chavesProgresso.dbv('').slice(0, 2) }),
    invalidarUnidades(cliente),
  ])
}

export function useDesbravadores(filtro: FiltroDesbravadores) {
  return useQuery({
    queryKey: chavesDesbravadores.lista(filtro),
    queryFn: () =>
      requisitar(
        `/api/desbravadores${montarConsulta({
          busca: filtro.busca || undefined,
          unidadeId: filtro.unidadeId,
          semUnidade: filtro.semUnidade || undefined,
          classeId: filtro.classeId,
          ativo: filtro.ativo,
          tipo: filtro.tipo,
          pagina: filtro.pagina,
          porPagina: POR_PAGINA,
        })}`,
        DesbravadorLista,
      ),
    placeholderData: keepPreviousData,
  })
}

const comAvisosDoDesbravador = comAvisos(DesbravadorSaida)

export function useCriarDesbravador() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (entrada: NovoDesbravador) =>
      requisitar('/api/desbravadores', comAvisosDoDesbravador, {
        metodo: 'POST',
        corpo: DesbravadorCriarEntrada.parse(entrada),
      }),
    onSuccess: (resposta) => aposGravar(cliente, resposta.dados),
  })
}

export function useEditarDesbravador() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: ({ id, entrada }: { id: string; entrada: EdicaoDesbravador }) =>
      requisitar(`/api/desbravadores/${id}`, comAvisosDoDesbravador, {
        metodo: 'PATCH',
        corpo: DesbravadorEditarEntrada.parse(entrada),
      }),
    // Trocar o Tipo para Diretoria ou Líder encerra a unidade: a contagem das unidades muda.
    onSuccess: (resposta) => aposGravar(cliente, resposta.dados),
  })
}

export function useInativarDesbravador() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: ({ id, saidaEm }: { id: string; saidaEm: string }) =>
      requisitar(`/api/desbravadores/${id}/inativar`, DesbravadorSaida, {
        metodo: 'POST',
        corpo: InativarEntrada.parse({ saidaEm }),
      }),
    onSuccess: (inativado) => aposGravar(cliente, inativado),
  })
}

export function useReativarDesbravador() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => requisitar(`/api/desbravadores/${id}/reativar`, DesbravadorSaida, { metodo: 'POST' }),
    onSuccess: (reativado) => aposGravar(cliente, reativado),
  })
}

/**
 * Matricula na classe regular do ano do clube (e na avançada ligada, com `incluirAvancada`). A API
 * encerra como desistência a regular que estava em curso na mesma trilha.
 */
export function useMatricular() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...entrada }: { id: string; classeId: string; anoClube: number; incluirAvancada: boolean }) =>
      requisitar(`/api/desbravadores/${id}/matriculas`, z.array(MatriculaSaida), {
        metodo: 'POST',
        corpo: MatriculaEntrada.parse(entrada),
      }),
    // A matrícula muda a classe do ano, que o desbravador gravado antes dela ainda não traz: relê para a ficha abrir com a nova.
    onSuccess: async (_, { id }) => {
      const relido = await cliente.fetchQuery({ queryKey: chavesDesbravadores.um(id), queryFn: () => lerDesbravador(id), staleTime: 0 }).catch(() => undefined)
      return aposGravar(cliente, relido)
    },
  })
}

/** `unidadeId: null` tira o desbravador da unidade. `desde` é hoje no fuso do clube. */
export function useMoverUnidade() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: ({ id, unidadeId }: { id: string; unidadeId: string | null }) =>
      requisitar(`/api/desbravadores/${id}/unidade`, DesbravadorSaida, {
        metodo: 'PUT',
        corpo: MoverUnidadeEntrada.parse({ unidadeId, desde: hojeDoClube() }),
      }),
    onSuccess: (movido) => aposGravar(cliente, movido),
  })
}
