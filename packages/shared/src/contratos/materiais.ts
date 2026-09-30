import { z } from 'zod'
import { TipoMaterial } from '../enums'
import { InstanteIso, TextoCurto, Uuid } from './comum'

export const MaterialLinkEntrada = z.object({
  classeId: Uuid, secaoId: Uuid.nullable(), titulo: TextoCurto,
  url: z.url({ protocol: /^https$/, message: 'Use um link https://' }),
})
/** Campo `dados` do multipart de POST /materiais/arquivo; o campo `arquivo` é o documento. */
export const MaterialArquivoDados = z.object({ classeId: Uuid, secaoId: Uuid.nullable(), titulo: TextoCurto })
export const MaterialEditarEntrada = z.object({ titulo: TextoCurto, secaoId: Uuid.nullable() }).partial()
export const MaterialSaida = z.object({
  id: Uuid, classeId: Uuid,
  secao: z.object({ id: Uuid, codigo: z.string(), nome: z.string() }).nullable(),
  titulo: z.string(), tipo: TipoMaterial,
  url: z.string(),               // link externo, ou URL assinada (10 min) do arquivo
  bytes: z.number().int().nullable(),
  enviadoPor: z.string(), criadoEm: InstanteIso, podeEditar: z.boolean(),
})
// GET /classes/:id/materiais → MaterialSaida[] (seção na ordem do caderno, depois sem seção; criadoEm ↓)
// POST /materiais/link → MaterialSaida · POST /materiais/arquivo (multipart) → MaterialSaida
// PATCH /materiais/:id → MaterialSaida · DELETE /materiais/:id → 204
