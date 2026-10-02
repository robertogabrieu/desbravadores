import type { AulaDetalhe, AulaEnvioSaida, AulaResumo, PacoteSaida } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { z } from 'zod'
import { uuid } from './sessao'

type Detalhe = z.infer<typeof AulaDetalhe>
type Resumo = z.infer<typeof AulaResumo>
type SaidaEnvio = z.infer<typeof AulaEnvioSaida>
type ClasseInstrutor = NonNullable<z.infer<typeof PacoteSaida>['instrutor']>['classes'][number]

export const CLASSE_COMPANHEIRO = { id: uuid(400), nome: 'Companheiro', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: 'classe-companheiro' } as const

export function criarResumoAula(parcial: Partial<Resumo> = {}): Resumo {
  return { id: uuid(700), data: '2030-03-10', presentes: 2, total: 3, requisitosConcluidos: 1, ...parcial }
}

export function criarDetalheAula(parcial: Partial<Detalhe> = {}): Detalhe {
  return {
    id: uuid(700),
    classe: CLASSE_COMPANHEIRO,
    data: '2030-03-10',
    aulaPlanejadaId: null,
    registradoPor: 'Ana Souza',
    presencas: [],
    requisitosDaAula: [],
    concluidosNaAula: [],
    podeEditar: true,
    ...parcial,
  }
}

export function criarClasseInstrutor(parcial: Partial<ClasseInstrutor> = {}): ClasseInstrutor {
  return { classe: CLASSE_COMPANHEIRO, membros: [], requisitos: [], aulasProximas: [], registrosRecentes: [], tarefas: [], ...parcial }
}

/** Resposta de PUT /api/sync/aulas/:uuid sem nada de especial: sem conflito, sem aviso, sem tarefa. */
export function criarSaidaEnvioAula(parcial: Partial<SaidaEnvio> = {}): SaidaEnvio {
  return {
    registroAulaId: uuid(700),
    presencas: [],
    conflitos: [],
    ignorados: [],
    requisitosSemEfeito: [],
    avisos: [],
    totalPontos: 0,
    tarefaId: null,
    tarefaItensSemEfeito: [],
    especialidadesSemEfeito: [],
    ...parcial,
  }
}

export const handlerAulas = (resumos: Resumo[]) => http.get('/api/classes/:id/aulas', () => HttpResponse.json(resumos))

export const handlerAula = (detalhe: Detalhe) => http.get(`/api/aulas/${detalhe.id}`, () => HttpResponse.json(detalhe))

export const handlerErroAula = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.get('/api/aulas/:id', () => HttpResponse.json(erro, { status }))
