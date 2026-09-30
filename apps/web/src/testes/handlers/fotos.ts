import type { AlbumDetalhe, AlbumResumo, FotoSaida } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { z } from 'zod'
import { uuid } from './sessao'

export type Album = z.infer<typeof AlbumResumo>
export type Detalhe = z.infer<typeof AlbumDetalhe>
export type Foto = z.infer<typeof FotoSaida>

export const UNIDADE_AGUIAS = { id: uuid(201), nome: 'Águias' }
export const UNIDADE_LEOES = { id: uuid(202), nome: 'Leões' }

export function criarAlbum(parcial: Partial<Album> = {}): Album {
  return {
    id: uuid(700),
    titulo: 'Reunião · 20 set',
    data: '2030-09-20',
    reuniaoId: null,
    totalFotos: 6,
    capaUrl: '/api/arquivos/capa.jpg',
    enviadoPor: ['Thiago'],
    ...parcial,
  }
}

export function criarFoto(parcial: Partial<Foto> = {}): Foto {
  return {
    id: uuid(800),
    legenda: null,
    enviadaPor: 'Thiago',
    enviadaEm: '2030-09-20T13:00:00.000Z',
    url: '/api/arquivos/foto-800.jpg',
    miniaturaUrl: '/api/arquivos/foto-800-mini.jpg',
    podeRemover: false,
    ...parcial,
  }
}

export function criarDetalhe(parcial: Partial<Detalhe> = {}): Detalhe {
  return {
    id: uuid(700),
    titulo: 'Reunião · 20 set',
    data: '2030-09-20',
    unidade: UNIDADE_AGUIAS,
    reuniaoId: null,
    fotos: [criarFoto({ id: uuid(801) }), criarFoto({ id: uuid(802), legenda: 'Grito de guerra' }), criarFoto({ id: uuid(803) })],
    ...parcial,
  }
}

/** GET /api/albuns; `aoReceber` recebe a consulta (ex.: `unidadeId`). */
export const handlerAlbuns = (albuns: Album[] = [criarAlbum()], aoReceber?: (consulta: URLSearchParams) => void) =>
  http.get('/api/albuns', ({ request }) => {
    aoReceber?.(new URL(request.url).searchParams)
    return HttpResponse.json(albuns)
  })

export const handlerErroAlbuns = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.get('/api/albuns', () => HttpResponse.json(erro, { status }))

export const handlerAlbum = (detalhe: Detalhe = criarDetalhe()) =>
  http.get('/api/albuns/:id', () => HttpResponse.json(detalhe))

export const handlerErroAlbum = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.get('/api/albuns/:id', () => HttpResponse.json(erro, { status }))

/** DELETE /api/fotos/:id; `removidas` recebe os ids apagados. */
export const handlerRemoverFoto = (removidas: string[] = []) =>
  http.delete('/api/fotos/:id', ({ params }) => {
    removidas.push(String(params.id))
    return new HttpResponse(null, { status: 204 })
  })

export const handlerErroRemoverFoto = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.delete('/api/fotos/:id', () => HttpResponse.json(erro, { status }))

export const handlerSemAutorizacao = (nomes: string[] = []) =>
  http.get('/api/unidades/:id/sem-autorizacao-imagem', () => HttpResponse.json({ nomes }))
