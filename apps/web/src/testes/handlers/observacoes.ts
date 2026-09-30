import type { ObservacaoSaida } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { z } from 'zod'
import { uuid } from './sessao'

export type Observacao = z.infer<typeof ObservacaoSaida>

export function criarObservacao(parcial: Partial<Observacao> = {}): Observacao {
  return {
    id: uuid(901), classeId: uuid(301), alvo: 'AULA',
    aula: { id: uuid(951), data: '2030-09-27' }, dbv: null,
    titulo: 'Descoberta espiritual', texto: 'Turma animada com o jogo.',
    autor: 'Priscila', criadaEm: '2030-09-27T13:02:00.000Z', editadaEm: null,
    podeEditar: true, podeApagar: true,
    ...parcial,
  }
}

/** GET /api/observacoes: devolve as do `alvo` pedido; `aoReceber` recebe a consulta. */
export const handlerObservacoes = (todas: Observacao[], aoReceber?: (consulta: URLSearchParams) => void) =>
  http.get('/api/observacoes', ({ request }) => {
    const consulta = new URL(request.url).searchParams
    aoReceber?.(consulta)
    const alvo = consulta.get('alvo')
    return HttpResponse.json(alvo ? todas.filter((o) => o.alvo === alvo) : todas)
  })

export const handlerAulasDaClasse = (aulas: Array<{ id: string; data: string }>) =>
  http.get('/api/classes/:id/aulas', () => HttpResponse.json(aulas.map((a) => ({ ...a, presentes: 5, total: 6, requisitosConcluidos: 2 }))))
