import type { AreaComEspecialidades, EspecialidadesDoDbvSaida } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { z } from 'zod'
import { uuid } from './sessao'

export type Areas = z.infer<typeof AreaComEspecialidades>[]
export type EspecialidadesDoDbv = z.infer<typeof EspecialidadesDoDbvSaida>

export const ESP_NOS = uuid(801)
export const ESP_AVES = uuid(802)
export const ESP_CIRURGIA = uuid(803)

export const criarAreas = (): Areas => [
  {
    id: uuid(701), codigo: 'AH', nome: 'Artes e habilidades manuais', ordem: 1,
    especialidades: [{ id: ESP_NOS, nome: 'Nós e Amarras', origem: 'OFICIAL' }],
  },
  {
    id: uuid(702), codigo: 'EN', nome: 'Estudo da natureza', ordem: 2,
    especialidades: [
      { id: ESP_AVES, nome: 'Aves', origem: 'OFICIAL' },
      { id: ESP_CIRURGIA, nome: 'Anatomia e Cirurgia', origem: 'OFICIAL' },
    ],
  },
]

export const handlerCatalogoEspecialidades = (areas: Areas = criarAreas()) => http.get('/api/especialidades', () => HttpResponse.json(areas))

export const handlerEspecialidadesDoDbv = (dbvId: string, saida: EspecialidadesDoDbv) =>
  http.get(`/api/desbravadores/${dbvId}/especialidades`, () => HttpResponse.json(saida))

export const handlerEspecialidadesDoDbvNaoEncontrado = (dbvId: string) =>
  http.get(`/api/desbravadores/${dbvId}/especialidades`, () =>
    HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado.' }, { status: 404 }),
  )
