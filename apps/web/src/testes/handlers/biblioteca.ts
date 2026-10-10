import type { BibliotecaSaida, CategoriaBibliotecaSaida, ItemBibliotecaSaida } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import { uuid } from './sessao'

export type ItemBiblioteca = ItemBibliotecaSaida
export type CategoriaBiblioteca = CategoriaBibliotecaSaida

export function criarItemBiblioteca(n: number, parcial: Partial<ItemBiblioteca> = {}): ItemBiblioteca {
  return {
    id: uuid(7000 + n), categoriaId: uuid(6001), nome: `Livro ${n}`, descricao: null, bytes: 1_258_291,
    urlLer: `https://arquivos.test/ler-${n}.pdf`, urlBaixar: `https://arquivos.test/baixar-${n}.pdf`, capaUrl: null,
    ...parcial,
  }
}

export function criarCategoriaBiblioteca(n: number, itens: ItemBiblioteca[] = [], parcial: Partial<CategoriaBiblioteca> = {}): CategoriaBiblioteca {
  return { id: uuid(6000 + n), nome: `Categoria ${n}`, itens: itens.map((item) => ({ ...item, categoriaId: uuid(6000 + n) })), ...parcial }
}

export const handlerBiblioteca = (categorias: CategoriaBiblioteca[]) =>
  http.get('/api/biblioteca', () => HttpResponse.json({ categorias } satisfies BibliotecaSaida))
