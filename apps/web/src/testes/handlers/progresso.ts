import type { ProgressoClasseSaida, ProgressoDbvSaida } from '@desbravadores/shared'
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

export type ProgressoDbv = z.infer<typeof ProgressoDbvSaida>
type MatriculaDbv = ProgressoDbv['matriculas'][number]

export const criarRequisitoDoDbv = (n: number, secaoCodigo: string, concluidoEm: string | null, podeMarcar = true): MatriculaDbv['secoes'][number]['requisitos'][number] => ({
  id: uuid(500 + n), codigo: `${secaoCodigo}.${n}`, texto: `Requisito ${secaoCodigo}.${n}`, campo: false, secaoCodigo, concluidoEm, marcadoPor: concluidoEm ? 'Priscila' : null, podeMarcar,
})

/** Regular com duas seções (uma completa, uma em 1/2) e uma avançada em 0%. */
export function criarProgressoDbv(podeMarcar = true): ProgressoDbv {
  return {
    matriculas: [
      {
        classe: CLASSE_AMIGO, anoClube: 2020, status: 'CURSANDO', percentual: 67, concluidos: 2, total: 3,
        secoes: [
          { codigo: 'GE', nome: 'Gerais', concluidos: 1, total: 1, requisitos: [criarRequisitoDoDbv(1, 'GE', '2020-03-10', podeMarcar)] },
          { codigo: 'DE', nome: 'Descoberta espiritual', concluidos: 1, total: 2, requisitos: [criarRequisitoDoDbv(1, 'DE', '2020-04-02', podeMarcar), criarRequisitoDoDbv(2, 'DE', null, podeMarcar)] },
        ],
      },
      { classe: CLASSE_AMIGO_AVANCADA, anoClube: 2020, status: 'CURSANDO', percentual: 0, concluidos: 0, total: 4, secoes: [] },
    ],
  }
}

export const handlerProgressoDbv = (saida: ProgressoDbv = criarProgressoDbv()) =>
  http.get('/api/desbravadores/:id/progresso', () => HttpResponse.json(saida))

export const handlerMarcarRequisito = (aoChamar: (corpo: unknown) => void, saida: ProgressoDbv = criarProgressoDbv()) =>
  http.put('/api/desbravadores/:id/requisitos/:requisitoId', async ({ request }) => {
    aoChamar(await request.json())
    return HttpResponse.json(saida)
  })

export const handlerDesmarcarRequisito = (aoChamar: () => void, saida: ProgressoDbv = criarProgressoDbv()) =>
  http.delete('/api/desbravadores/:id/requisitos/:requisitoId', () => {
    aoChamar()
    return HttpResponse.json(saida)
  })

export const handlerErroRequisito = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.put('/api/desbravadores/:id/requisitos/:requisitoId', () => HttpResponse.json(erro, { status }))
