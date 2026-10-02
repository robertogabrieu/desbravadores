import { HttpResponse, http } from 'msw'
import type { InicioConselheiro } from '../../api/inicio'
import { uuid } from './sessao'

export const UNIDADE_AGUIAS = { id: uuid(101), nome: 'Águias' }
export const UNIDADE_LEOES = { id: uuid(102), nome: 'Leões' }

export function criarInicioConselheiro(parcial: Partial<InicioConselheiro> = {}): InicioConselheiro {
  return {
    unidade: UNIDADE_AGUIAS,
    unidades: [UNIDADE_AGUIAS],
    proximaReuniao: { data: '2030-09-29', horario: '08:30', local: 'Cantinho da unidade', nome: null, ehHoje: true, chamadaFeita: false },
    feriasAte: null,
    totalDbvs: 8,
    frequenciaMes: 87,
    posicaoUnidade: { posicao: 2, total: 4 },
    destaques: [
      { posicao: 1, dbvId: uuid(201), nome: 'Ana Clara Souza', pontos: 446 },
      { posicao: 2, dbvId: uuid(202), nome: 'Pedro Henrique Lima', pontos: 428 },
      { posicao: 3, dbvId: uuid(203), nome: 'Júlia Ramos', pontos: 398 },
    ],
    ...parcial,
  }
}

/** GET /api/inicio/conselheiro; `aoReceber` recebe a consulta (ex.: `unidadeId`). */
export const handlerInicioConselheiro = (saida: InicioConselheiro = criarInicioConselheiro(), aoReceber?: (consulta: URLSearchParams) => void) =>
  http.get('/api/inicio/conselheiro', ({ request }) => {
    aoReceber?.(new URL(request.url).searchParams)
    return HttpResponse.json(saida)
  })

export const handlerErroInicio = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.get('/api/inicio/conselheiro', () => HttpResponse.json(erro, { status }))
