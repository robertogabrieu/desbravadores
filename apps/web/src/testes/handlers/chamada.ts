import type { ReuniaoDetalhe } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { z } from 'zod'

type Detalhe = z.infer<typeof ReuniaoDetalhe>

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export function criarDetalheReuniao(parcial: Partial<Detalhe> = {}): Detalhe {
  return {
    id: uuid(700),
    unidade: { id: uuid(201), nome: 'Águias' },
    data: '2030-03-10',
    horario: '09:00',
    local: null,
    observacoes: null,
    cabecalhoVersao: '2030-03-10T12:00:00.000Z',
    registradaPor: { nome: 'Ana Souza' },
    registradaEm: '2030-03-10T12:00:00.000Z',
    alterada: null,
    podeEditar: true,
    chamada: [],
    totais: { presentes: 0, total: 0, atrasos: 0, uniformes: 0, biblias: 0, pontos: 0 },
    album: null,
    ...parcial,
  }
}

export const handlerReuniao = (detalhe: Detalhe) => http.get(`/api/reunioes/${detalhe.id}`, () => HttpResponse.json(detalhe))

export const handlerReuniaoRecusada = (id: string, status: number, mensagem: string) =>
  http.get(`/api/reunioes/${id}`, () => HttpResponse.json({ codigo: 'REGRA', mensagem }, { status }))
