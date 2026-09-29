import type { GradeFrequenciaSaida, ReuniaoDetalhe, ReuniaoResumo } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { z } from 'zod'
import { uuid } from './sessao'

export type Resumo = z.infer<typeof ReuniaoResumo>
export type Detalhe = z.infer<typeof ReuniaoDetalhe>
export type Grade = z.infer<typeof GradeFrequenciaSaida>

export function criarResumo(parcial: Partial<Resumo> = {}): Resumo {
  return {
    id: uuid(600),
    data: '2026-09-20',
    horario: '09:00',
    presentes: 7,
    total: 8,
    atrasos: 1,
    uniformes: 6,
    biblias: 5,
    percentual: 88,
    alterada: false,
    ...parcial,
  }
}

export function criarDetalhe(parcial: Partial<Detalhe> = {}): Detalhe {
  return {
    id: uuid(600),
    unidade: { id: uuid(201), nome: 'Águias' },
    data: '2026-09-20',
    horario: '09:00',
    local: null,
    observacoes: null,
    cabecalhoVersao: '2026-09-20T13:40:00.000Z',
    registradaPor: { nome: 'Thiago' },
    registradaEm: '2026-09-20T13:40:00.000Z',
    alterada: null,
    podeEditar: true,
    chamada: [
      { dbvId: uuid(301), nome: 'Ana Clara Souza', nomePublico: 'Ana S.', situacao: 'PRESENTE', uniforme: true, biblia: true, licao: false, versao: '2026-09-20T13:40:00.000Z', pontos: 18 },
      { dbvId: uuid(302), nome: 'Pedro Lima', nomePublico: 'Pedro L.', situacao: 'ATRASADO', uniforme: false, biblia: true, licao: false, versao: '2026-09-20T13:40:00.000Z', pontos: 8 },
      { dbvId: uuid(303), nome: 'Davi Carvalho', nomePublico: 'Davi C.', situacao: 'FALTA_JUSTIFICADA', uniforme: false, biblia: false, licao: false, versao: '2026-09-20T13:40:00.000Z', pontos: 0 },
    ],
    totais: { presentes: 2, total: 3, atrasos: 1, uniformes: 1, biblias: 2, pontos: 26 },
    album: null,
    ...parcial,
  }
}

export function criarGrade(parcial: Partial<Grade> = {}): Grade {
  return {
    reunioes: [
      { id: uuid(601), data: '2026-09-13' },
      { id: uuid(600), data: '2026-09-20' },
    ],
    linhas: [
      { dbvId: uuid(301), nome: 'Ana Clara Souza', marcas: ['P', 'A'], percentual: 100 },
      { dbvId: uuid(302), nome: 'Pedro Lima', marcas: ['F', null], percentual: 50 },
    ],
    ...parcial,
  }
}

/** Responde por mês (`AAAA-MM`); mês sem entrada volta lista vazia. */
export const handlerReunioes = (porMes: Record<string, Resumo[]>, consultas?: { unidadeId: string; mes: string }[]) =>
  http.get('/api/reunioes', ({ request }) => {
    const url = new URL(request.url)
    const mes = url.searchParams.get('mes') ?? ''
    consultas?.push({ unidadeId: url.searchParams.get('unidadeId') ?? '', mes })
    return HttpResponse.json(porMes[mes] ?? [])
  })

export const handlerReuniao = (detalhe: Detalhe = criarDetalhe()) => http.get('/api/reunioes/:id', () => HttpResponse.json(detalhe))

export const handlerGrade = (grade: Grade = criarGrade()) => http.get('/api/unidades/:id/frequencia', () => HttpResponse.json(grade))

export const handlerErroReunioes = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.get('/api/reunioes', () => HttpResponse.json(erro, { status }))

export const handlerErroReuniao = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.get('/api/reunioes/:id', () => HttpResponse.json(erro, { status }))

export const handlerErroGrade = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.get('/api/unidades/:id/frequencia', () => HttpResponse.json(erro, { status }))
