import type { MaterialSaida } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { z } from 'zod'
import { uuid } from './sessao'

export type Material = z.infer<typeof MaterialSaida>

export const SECAO_ESPIRITUAL = { id: uuid(1001), codigo: '1', nome: 'Descoberta espiritual' }
export const SECAO_GERAIS = { id: uuid(1002), codigo: '2', nome: 'Gerais' }

export function criarMaterial(parcial: Partial<Material> = {}): Material {
  return {
    id: uuid(1101), classeId: uuid(301), secao: SECAO_ESPIRITUAL,
    titulo: 'Os 10 Mandamentos – cartões', tipo: 'PDF', url: 'https://arquivos.test/a.pdf',
    bytes: 1_258_291, enviadoPor: 'Priscila', criadoEm: '2030-09-20T12:00:00.000Z', podeEditar: true,
    ...parcial,
  }
}

export const handlerMateriais = (lista: Material[]) => http.get('/api/classes/:id/materiais', () => HttpResponse.json(lista))

export const handlerSecoesDaClasse = () =>
  http.get('/api/classes/:id', () =>
    HttpResponse.json({
      id: uuid(301), nome: 'Amigo', idade: 10, tipo: 'REGULAR', trilha: 'INDIVIDUAL', origem: 'OFICIAL', classeBaseId: null,
      ordem: 1, corToken: '--classe-amigo', ativa: true, quemMontaCronograma: 'ADM', totalRequisitos: 2,
      secoes: [SECAO_ESPIRITUAL, SECAO_GERAIS].map((s, i) => ({ ...s, ordem: i + 1, requisitos: [] })),
    }),
  )
