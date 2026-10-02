import { UsuarioCriarEntrada, UsuarioEditarEntrada, UsuarioLista, UsuarioSaida, VinculoEditarEntrada, VinculoEntrada } from '@desbravadores/shared'
import type { Papel } from '@desbravadores/shared'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useSessao } from '../sessao/useSessao'
import { montarConsulta, requisitar, requisitarSemResposta } from './cliente'
import { chavesDesbravadores } from './desbravadores'

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
  um: (id: string) => ['usuarios', id] as const,
}

export function useUsuario(id: string, habilitada = true) {
  return useQuery({ queryKey: chavesUsuarios.um(id), queryFn: () => requisitar(`/api/usuarios/${id}`, UsuarioSaida), enabled: habilitada })
}

export function useUsuarios(filtro: FiltroUsuarios) {
  return useQuery({
    queryKey: chavesUsuarios.lista(filtro),
    queryFn: () =>
      requisitar(`/api/usuarios${montarConsulta({ ...filtro, busca: filtro.busca || undefined, porPagina: POR_PAGINA_USUARIOS })}`, UsuarioLista),
    placeholderData: keepPreviousData,
  })
}

/** Toda escrita refaz as listas; a que devolve o usuário já deixa a ficha dele com o dado novo. */
function useEscrita<V, R>(escrever: (variaveis: V) => Promise<R>, aoGravar?: (cliente: QueryClient, resposta: R) => void) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: escrever,
    onSuccess: (resposta) => {
      aoGravar?.(cliente, resposta)
      return cliente.invalidateQueries({ queryKey: chavesUsuarios.todas })
    },
  })
}

const naFicha = (cliente: QueryClient, usuario: Usuario) => cliente.setQueryData(chavesUsuarios.um(usuario.id), usuario)

/** Gravação que mexe em papel: refaz listas, unidades (mostram os conselheiros) e desbravadores
 *  (o tipo da ficha ligada à conta pode mudar entre Diretoria e DBV); se é o logado, relê a sessão. */
function useEscritaDePapel<V>(escrever: (variaveis: V) => Promise<Usuario>, gravarNaFicha = true) {
  const cliente = useQueryClient()
  const { eu, vinculoAtivo, relerSessao } = useSessao()
  return useMutation({
    mutationFn: escrever,
    onSuccess: async (usuario) => {
      const ehVoce = usuario.id === eu?.usuario.id
      if (ehVoce && usuario.vinculos.some((v) => v.id === vinculoAtivo?.id && !v.ativo)) {
        // A tela leva a /papel ou ao login; reler a ficha agora daria 403 e uma segunda navegação (cliente.ts:138-142).
        await cliente.invalidateQueries({ queryKey: chavesUsuarios.todas, refetchType: 'none' })
        return
      }
      if (gravarNaFicha) naFicha(cliente, usuario)
      if (ehVoce) await relerSessao()
      await Promise.all(
        [chavesUsuarios.todas, ['unidades'], chavesDesbravadores.todos].map((queryKey) => cliente.invalidateQueries({ queryKey })),
      )
    },
  })
}

/** A resposta da criação é eco para e-mail que já existia: a ficha do criado lê do servidor, não dela. */
export const useCriarUsuario = () =>
  useEscritaDePapel((corpo: NovoUsuario) => requisitar('/api/usuarios', UsuarioSaida, { metodo: 'POST', corpo }), false)

export const useEditarUsuario = () =>
  useEscrita(
    ({ id, corpo }: { id: string; corpo: EdicaoUsuario }) => requisitar(`/api/usuarios/${id}`, UsuarioSaida, { metodo: 'PATCH', corpo }),
    naFicha,
  )

export const useDesativarUsuario = () =>
  useEscritaDePapel((id: string) => requisitar(`/api/usuarios/${id}/desativar`, UsuarioSaida, { metodo: 'POST' }))

export const useAcrescentarVinculo = () =>
  useEscritaDePapel(({ usuarioId, corpo }: { usuarioId: string; corpo: NovoVinculo }) =>
    requisitar(`/api/usuarios/${usuarioId}/vinculos`, UsuarioSaida, { metodo: 'POST', corpo }),
  )

export const useEditarVinculo = () =>
  useEscritaDePapel(({ vinculoId, corpo }: { vinculoId: string; corpo: EdicaoVinculo }) =>
    requisitar(`/api/vinculos/${vinculoId}`, UsuarioSaida, { metodo: 'PUT', corpo }),
  )

export const useReenviarConvite = () =>
  useEscrita((id: string) => requisitarSemResposta(`/api/usuarios/${id}/convite`, { metodo: 'POST' }))
