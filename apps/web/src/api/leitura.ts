import { CatalogoPermissoesSaida, ClasseSaida, MembroSaida, UnidadeSaida, UsuarioLista } from '@desbravadores/shared'
import type { Papel } from '@desbravadores/shared'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { montarConsulta, requisitar } from './cliente'

export type Classe = z.infer<typeof ClasseSaida>
export type Unidade = z.infer<typeof UnidadeSaida>
export type Membro = z.infer<typeof MembroSaida>
export type ListaUsuarios = z.infer<typeof UsuarioLista>
export type CatalogoPermissao = z.infer<typeof CatalogoPermissoesSaida>[number]

export interface FiltroClasses {
  trilha?: Classe['trilha']
  tipo?: Classe['tipo']
}
export interface FiltroUsuariosResumo {
  papel?: Papel
  busca?: string
}

/** Chaves exportadas para as telas invalidarem depois de gravar. */
export const chavesLeitura = {
  classes: (filtro: FiltroClasses) => ['classes', filtro] as const,
  unidades: (todas: boolean) => ['unidades', { todas }] as const,
  usuariosResumo: (filtro: FiltroUsuariosResumo) => ['usuarios', 'resumo', filtro] as const,
  catalogoPermissoes: ['permissoes', 'catalogo'] as const,
  membrosUnidade: (unidadeId: string) => ['unidades', unidadeId, 'membros'] as const,
  semMembros: ['unidades', 'sem-membros'] as const,
}

export function useClasses(filtro: FiltroClasses = {}) {
  return useQuery({
    queryKey: chavesLeitura.classes(filtro),
    queryFn: () => requisitar(`/api/classes${montarConsulta({ ...filtro })}`, z.array(ClasseSaida)),
  })
}

/** `todas: true` inclui unidades inativas (só o Adm pode). */
export function useUnidades({ todas = false }: { todas?: boolean } = {}) {
  return useQuery({
    queryKey: chavesLeitura.unidades(todas),
    queryFn: () =>
      requisitar(`/api/unidades${montarConsulta({ todas: todas || undefined })}`, z.array(UnidadeSaida)),
  })
}

/** Primeira página (até 100) de usuários, para preencher seletores; a lista paginada é da tela de Usuários. */
export function useUsuariosResumo(filtro: FiltroUsuariosResumo = {}) {
  return useQuery({
    queryKey: chavesLeitura.usuariosResumo(filtro),
    queryFn: () =>
      requisitar(`/api/usuarios${montarConsulta({ pagina: 1, porPagina: 100, ...filtro })}`, UsuarioLista),
  })
}

export function useCatalogoPermissoes() {
  return useQuery({
    queryKey: chavesLeitura.catalogoPermissoes,
    queryFn: () => requisitar('/api/permissoes/catalogo', CatalogoPermissoesSaida),
    staleTime: Infinity,
  })
}

/** Desbravadores (tipo DBV) de uma unidade, por nome. Sem `unidadeId` não consulta. */
export function useMembrosUnidade(unidadeId: string | undefined) {
  return useQuery({
    queryKey: chavesLeitura.membrosUnidade(unidadeId ?? ''),
    queryFn: () => requisitar(`/api/unidades/${unidadeId ?? ''}/membros`, z.array(MembroSaida)),
    enabled: unidadeId !== undefined,
  })
}

/** Desbravadores sem unidade (só quem gerencia unidades). */
export function useSemMembros() {
  return useQuery({
    queryKey: chavesLeitura.semMembros,
    queryFn: () => requisitar('/api/unidades/sem-membros', z.array(MembroSaida)),
  })
}
