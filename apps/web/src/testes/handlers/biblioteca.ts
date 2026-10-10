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

export interface ChamadaBiblioteca {
  metodo: string
  caminho: string
  corpo: unknown
}

async function registrar(chamadas: ChamadaBiblioteca[], request: Request): Promise<void> {
  const texto = await request.text()
  chamadas.push({ metodo: request.method, caminho: new URL(request.url).pathname, corpo: texto === '' ? null : (JSON.parse(texto) as unknown) })
}

const semConteudo = () => new HttpResponse(null, { status: 204 })

/**
 * Escrita da biblioteca que fala JSON: cada chamada vai para `chamadas`, na ordem. O envio do PDF
 * (POST /itens) e da capa (PUT /itens/:id/capa) é multipart e o interceptador do msw não lê o
 * FormData do jsdom: os testes o simulam com um XHR falso, como os de materiais.
 */
export const handlersEscritaBiblioteca = (chamadas: ChamadaBiblioteca[]) => [
  http.post('/api/biblioteca/categorias', async ({ request }) => {
    await registrar(chamadas, request)
    return HttpResponse.json(criarCategoriaBiblioteca(9, [], { nome: 'Comunicados' }), { status: 201 })
  }),
  http.patch('/api/biblioteca/categorias/:id', async ({ request, params }) => {
    await registrar(chamadas, request)
    return HttpResponse.json(criarCategoriaBiblioteca(1, [], { id: String(params.id), nome: 'Renomeada' }))
  }),
  http.post('/api/biblioteca/categorias/:id/mover', async ({ request }) => {
    await registrar(chamadas, request)
    return semConteudo()
  }),
  http.delete('/api/biblioteca/categorias/:id', async ({ request }) => {
    await registrar(chamadas, request)
    return semConteudo()
  }),
  http.patch('/api/biblioteca/itens/:id', async ({ request, params }) => {
    await registrar(chamadas, request)
    return HttpResponse.json(criarItemBiblioteca(1, { id: String(params.id) }))
  }),
  http.post('/api/biblioteca/itens/:id/mover', async ({ request }) => {
    await registrar(chamadas, request)
    return semConteudo()
  }),
  http.delete('/api/biblioteca/itens/:id/capa', async ({ request, params }) => {
    await registrar(chamadas, request)
    return HttpResponse.json(criarItemBiblioteca(1, { id: String(params.id), capaUrl: null }))
  }),
  http.delete('/api/biblioteca/itens/:id', async ({ request }) => {
    await registrar(chamadas, request)
    return semConteudo()
  }),
]
