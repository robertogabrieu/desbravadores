import { AlbumDetalhe, AlbumResumo, ReuniaoDetalhe, SemAutorizacaoSaida } from '@desbravadores/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { montarConsulta, requisitar, requisitarSemResposta } from './cliente'
import { chavesReunioes } from './reunioes'

export type Album = z.infer<typeof AlbumResumo>
export type DetalheAlbum = z.infer<typeof AlbumDetalhe>

/** As duas primeiras começam por `albuns`: o `aoEnviar` do tipo FOTO invalida a raiz. */
export const chavesFotos = {
  albuns: (unidadeId: string) => ['albuns', 'lista', unidadeId] as const,
  album: (id: string) => ['albuns', 'detalhe', id] as const,
  semAutorizacao: (unidadeId: string) => ['unidades', unidadeId, 'sem-autorizacao-imagem'] as const,
}

/** `habilitada: false` (sem conexão) não consulta: as fotos não ficam guardadas no aparelho. */
export function useAlbuns(unidadeId: string, habilitada = true) {
  return useQuery({
    queryKey: chavesFotos.albuns(unidadeId),
    queryFn: () => requisitar(`/api/albuns${montarConsulta({ unidadeId })}`, z.array(AlbumResumo)),
    enabled: habilitada,
  })
}

export function useAlbum(id: string | undefined, habilitada = true) {
  return useQuery({
    queryKey: chavesFotos.album(id ?? ''),
    queryFn: () => requisitar(`/api/albuns/${id ?? ''}`, AlbumDetalhe),
    enabled: habilitada && id !== undefined,
  })
}

export function useSemAutorizacao(unidadeId: string, habilitada = true) {
  return useQuery({
    queryKey: chavesFotos.semAutorizacao(unidadeId),
    queryFn: () => requisitar(`/api/unidades/${unidadeId}/sem-autorizacao-imagem`, SemAutorizacaoSaida),
    enabled: habilitada,
  })
}

/** A reunião de onde veio `?reuniao=`, com a mesma chave do detalhe da reunião. */
export function useReuniaoDoEnvio(id: string | undefined, habilitada = true) {
  return useQuery({
    queryKey: chavesReunioes.detalhe(id ?? ''),
    queryFn: () => requisitar(`/api/reunioes/${id ?? ''}`, ReuniaoDetalhe),
    enabled: habilitada && id !== undefined,
  })
}

export function useRemoverFoto() {
  const clienteConsultas = useQueryClient()
  return useMutation({
    // Sem 'always' a mutação ficaria pausada, sem resposta, com o navegador offline; assim ela falha e a tela avisa.
    networkMode: 'always',
    mutationFn: (fotoId: string) => requisitarSemResposta(`/api/fotos/${fotoId}`, { metodo: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([clienteConsultas.invalidateQueries({ queryKey: ['albuns'] }), clienteConsultas.invalidateQueries({ queryKey: ['reuniao'] })])
    },
  })
}
