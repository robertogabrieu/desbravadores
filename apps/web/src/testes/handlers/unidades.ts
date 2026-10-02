import { HttpResponse, http } from 'msw'
import type { Unidade } from '../../api/leitura'
import { lerPorId } from './caixa'
import type { Caixa } from './caixa'
import { criarUnidade } from './leitura'

type AoReceber = (corpo: unknown) => void

export const handlerCriarUnidade = (criada: Unidade = criarUnidade(), aoReceber?: AoReceber) =>
  http.post('/api/unidades', async ({ request }) => {
    aoReceber?.(await request.json())
    return HttpResponse.json(criada, { status: 201 })
  })

export const handlerEditarUnidade = (editada: Unidade = criarUnidade(), aoReceber?: (id: string, corpo: unknown) => void) =>
  http.patch('/api/unidades/:id', async ({ request, params }) => {
    aoReceber?.(String(params['id']), await request.json())
    return HttpResponse.json(editada)
  })

export const handlerErroEditarUnidade = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.patch('/api/unidades/:id', () => HttpResponse.json(erro, { status }))

/** GET /api/unidades/:id. "sem-membros" segue para o handler dele, como na API a rota literal vem antes. */
export const handlerUnidade = (...caixas: Caixa<Unidade>[]) =>
  http.get('/api/unidades/:id', ({ params }) => {
    const id = String(params['id'])
    if (id === 'sem-membros') return undefined
    return lerPorId(id, caixas, 'Unidade não encontrada.')
  })
