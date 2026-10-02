import { z } from 'zod'
import { AlvoObservacao } from '../enums'
import { DataCivil, InstanteIso, Uuid } from './comum'

export const ObservacaoEntrada = z
  .object({
    classeId: Uuid,
    alvo: AlvoObservacao,
    registroAulaId: Uuid.nullable(),
    dbvId: Uuid.nullable(),
    titulo: z.string().trim().max(80).nullable(),
    texto: z.string().trim().min(1).max(4000),
  })
  .refine((o) => (o.alvo === 'AULA' ? o.registroAulaId !== null && o.dbvId === null : o.dbvId !== null && o.registroAulaId === null), {
    message: 'Escolha o dia de classe ou o desbravador', path: ['alvo'],
  })
export const ObservacaoEditarEntrada = z.object({ titulo: z.string().trim().max(80).nullable(), texto: z.string().trim().min(1).max(4000) }).partial()
export const ObservacaoFiltro = z.object({ classeId: Uuid, alvo: AlvoObservacao.optional(), dbvId: Uuid.optional() })
export const ObservacaoSaida = z.object({
  id: Uuid, classeId: Uuid, alvo: AlvoObservacao,
  aula: z.object({ id: Uuid, data: DataCivil }).nullable(),
  dbv: z.object({ id: Uuid, nome: z.string() }).nullable(),
  titulo: z.string().nullable(), texto: z.string(),
  autor: z.string(), criadaEm: InstanteIso, editadaEm: InstanteIso.nullable(),
  podeEditar: z.boolean(),   // só o autor
  podeApagar: z.boolean(),   // autor ou Adm
})
// GET /observacoes?classeId&alvo&dbvId → ObservacaoSaida[] (criadaEm ↓) · POST → ObservacaoSaida 201
// PATCH /observacoes/:id → ObservacaoSaida · DELETE → 204
