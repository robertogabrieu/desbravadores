import { UsuarioCriarEntrada, UsuarioEditarEntrada, UsuarioLista, UsuarioSaida, VinculoEditarEntrada, VinculoEntrada } from '@desbravadores/shared'
import type { Papel } from '@desbravadores/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { montarConsulta, requisitar, requisitarSemResposta } from './cliente'

export type Usuario = z.infer<typeof UsuarioSaida>
export type VinculoUsuario = Usuario['vinculos'][number]
export type ListaUsuariosPaginada = z.infer<typeof UsuarioLista>
export type NovoUsuario = z.input<typeof UsuarioCriarEntrada>
export type NovoVinculo = z.input<typeof VinculoEntrada>
export type EdicaoUsuario = z.input<typeof UsuarioEditarEntrada>
export type EdicaoVinculo = z.input<typeof VinculoEditarEntrada>

export const POR_PAGINA_USUARIOS = 25

export interface FiltroUsuarios {
  papel?: Papel
  busca?: string
  pagina: number
}

export const chavesUsuarios = {
  todas: ['usuarios'] as const,
  lista: (filtro: FiltroUsuarios) => ['usuarios', 'lista', filtro] as const,
}

export function useUsuarios(filtro: FiltroUsuarios) {
  return useQuery({
    queryKey: chavesUsuarios.lista(filtro),
    queryFn: () =>
      requisitar(`/api/usuarios${montarConsulta({ ...filtro, busca: filtro.busca || undefined, porPagina: POR_PAGINA_USUARIOS })}`, UsuarioLista),
    placeholderData: keepPreviousData,
  })
}

/** Toda escrita de usuário ou vínculo refaz as listas (incluindo o resumo dos seletores). */
function useEscrita<V, R>(escrever: (variaveis: V) => Promise<R>) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: escrever,
    onSuccess: () => cliente.invalidateQueries({ queryKey: chavesUsuarios.todas }),
  })
}

export const useCriarUsuario = () =>
  useEscrita((corpo: NovoUsuario) => requisitar('/api/usuarios', UsuarioSaida, { metodo: 'POST', corpo }))

export const useEditarUsuario = () =>
  useEscrita(({ id, corpo }: { id: string; corpo: EdicaoUsuario }) =>
    requisitar(`/api/usuarios/${id}`, UsuarioSaida, { metodo: 'PATCH', corpo }),
  )

export const useDesativarUsuario = () =>
  useEscrita((id: string) => requisitar(`/api/usuarios/${id}/desativar`, UsuarioSaida, { metodo: 'POST' }))

export const useAcrescentarVinculo = () =>
  useEscrita(({ usuarioId, corpo }: { usuarioId: string; corpo: NovoVinculo }) =>
    requisitar(`/api/usuarios/${usuarioId}/vinculos`, UsuarioSaida, { metodo: 'POST', corpo }),
  )

export const useEditarVinculo = () =>
  useEscrita(({ vinculoId, corpo }: { vinculoId: string; corpo: EdicaoVinculo }) =>
    requisitar(`/api/vinculos/${vinculoId}`, UsuarioSaida, { metodo: 'PUT', corpo }),
  )

export const useReenviarConvite = () =>
  useEscrita((id: string) => requisitarSemResposta(`/api/usuarios/${id}/convite`, { metodo: 'POST' }))
