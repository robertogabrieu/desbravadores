import { HttpResponse, http } from 'msw'
import type { AulaDoCronograma, Cronograma } from '../../api/cronograma'
import { CLASSE_AMIGO } from './instrutor'
import { uuid } from './sessao'

export function criarAulaDoCronograma(parcial: Partial<AulaDoCronograma> = {}): AulaDoCronograma {
  return {
    origem: 'PLANEJADA',
    id: uuid(400),
    data: '2030-09-20',
    horario: '09:15',
    local: null,
    titulo: 'Arte de acampar',
    requisitos: [{ id: uuid(500), codigo: 'AC 2', texto: 'Nós básicos', campo: false, secaoCodigo: 'AC' }],
    situacao: 'PLANEJADA',
    registroAulaId: null,
    ...parcial,
  }
}

export function criarCronograma(parcial: Partial<Cronograma> = {}): Cronograma {
  return {
    cronogramaId: uuid(600),
    classe: CLASSE_AMIGO,
    anoClube: 2030,
    status: 'PUBLICADO',
    fonte: 'PUBLICADO',
    publicadoEm: '2030-01-10T12:00:00.000Z',
    podeMontar: false,
    aulas: [criarAulaDoCronograma()],
    ...parcial,
  }
}

/** GET /api/classes/:id/cronograma; `aoReceber` recebe o id da classe pedida. */
export const handlerCronograma = (saida: Cronograma = criarCronograma(), aoReceber?: (classeId: string) => void) =>
  http.get('/api/classes/:id/cronograma', ({ params }) => {
    aoReceber?.(String(params.id))
    return HttpResponse.json(saida)
  })

export const handlerErroCronograma = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.get('/api/classes/:id/cronograma', () => HttpResponse.json(erro, { status }))
