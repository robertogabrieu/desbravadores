import type { ProgressoClasseSaida } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { z } from 'zod'
import { uuid } from './sessao'

export type ProgressoClasse = z.infer<typeof ProgressoClasseSaida>

export const CLASSE_AMIGO = { id: uuid(301), nome: 'Amigo', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: '--classe-amigo' } as const
export const CLASSE_AMIGO_AVANCADA = { id: uuid(302), nome: 'Amigo da Natureza', tipo: 'AVANCADA', trilha: 'INDIVIDUAL', corToken: '--classe-amigo' } as const

const item = (n: number, nome: string, percentual: number, concluidos: number, total = 50): ProgressoClasse['itens'][number] => ({
  dbvId: uuid(n), nome, tipo: 'DBV', status: 'CURSANDO', concluidos, percentual, faltam: total - concluidos,
})

export function criarProgressoClasse(parcial: Partial<ProgressoClasse> = {}): ProgressoClasse {
  return {
    classe: CLASSE_AMIGO,
    anoClube: 2030,
    totalRequisitos: 50,
    media: 60,
    prontos: 1,
    concluiramAvancada: 0,
    abaixoDoLimiar: 1,
    itens: [item(401, 'Ana Clara Souza', 100, 50), item(402, 'Sofia Lopes', 62, 31), item(403, 'Miguel Teixeira', 20, 10)],
    ...parcial,
  }
}

export const handlerProgressoClasse = (saida: ProgressoClasse = criarProgressoClasse()) =>
  http.get('/api/classes/:id/progresso', () => HttpResponse.json(saida))

export const handlerErroProgressoClasse = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.get('/api/classes/:id/progresso', () => HttpResponse.json(erro, { status }))

export const handlerClassesCatalogo = (classes: Array<Record<string, unknown>>) =>
  http.get('/api/classes', () => HttpResponse.json(classes))
