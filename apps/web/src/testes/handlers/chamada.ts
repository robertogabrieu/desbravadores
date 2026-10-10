import type { ReuniaoDetalhe, ReuniaoEnvioSaida } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { z } from 'zod'
import { lerPorId } from './caixa'
import type { Caixa } from './caixa'

type Detalhe = z.infer<typeof ReuniaoDetalhe>
type SaidaEnvio = z.infer<typeof ReuniaoEnvioSaida>

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
    substituicao: null,
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

export const handlerReuniaoDe = (...caixas: Caixa<Detalhe>[]) =>
  http.get('/api/reunioes/:id', ({ params }) => lerPorId(String(params['id']), caixas, 'Reunião não encontrada.'))

export function criarSaidaEnvio(reuniaoId: string, parcial: Partial<SaidaEnvio> = {}): SaidaEnvio {
  return {
    reuniaoId,
    pontos: [],
    totalPontos: 0,
    linhas: [],
    cabecalhoVersao: '2030-03-10T12:30:00.000Z',
    conflitoCabecalho: false,
    conflitos: [],
    ignorados: [],
    ...parcial,
  }
}

/** PUT /api/sync/reunioes/:uuid: guarda cada pedido em `recebidos` e responde `saida(uuid)` ou a recusa. */
export function handlerCorrigirChamada(
  saida: (uuid: string) => SaidaEnvio,
  recebidos: { uuid: string; corpo: unknown }[] = [],
  recusa?: { status: number; codigo: string; mensagem: string },
) {
  return http.put('/api/sync/reunioes/:uuid', async ({ request, params }) => {
    const uuid = String(params['uuid'])
    recebidos.push({ uuid, corpo: await request.json() })
    if (recusa) return HttpResponse.json({ codigo: recusa.codigo, mensagem: recusa.mensagem }, { status: recusa.status })
    return HttpResponse.json(saida(uuid))
  })
}
