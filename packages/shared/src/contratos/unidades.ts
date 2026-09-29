import { z } from 'zod'
import { Sexo, TipoUnidade } from '../enums'
import { DataCivil, TextoCurto, Uuid } from './comum'
import { RefClasse } from './auth'

export const UnidadeCriarEntrada = z.object({
  nome: TextoCurto,
  tipo: TipoUnidade.default('MISTA'),
  gritoDeGuerra: z.string().trim().max(300).nullable().optional(),
})
export const UnidadeEditarEntrada = z
  .object({ nome: TextoCurto, tipo: TipoUnidade, gritoDeGuerra: z.string().trim().max(300).nullable(), ativa: z.boolean() })
  .partial()
export const UnidadeFiltro = z.object({ todas: z.stringbool().default(false) }) // true inclui inativas (só ADM)
export const UnidadeSaida = z.object({
  id: Uuid,
  nome: z.string(),
  tipo: TipoUnidade,
  gritoDeGuerra: z.string().nullable(),
  ativa: z.boolean(),
  conselheiros: z.array(z.object({ usuarioId: Uuid, nome: z.string() })),
  totalMembros: z.number().int(),
})
export const MembroSaida = z.object({
  dbvId: Uuid,
  nome: z.string(),
  nomePublico: z.string(),
  idade: z.number().int(),
  sexo: Sexo,
  classeAtual: RefClasse.nullable(),
  desde: DataCivil,
  /** Frequência do mês corrente; só em GET /unidades/:id/membros para quem tem `reuniao.ver`. */
  frequencia: z.number().int().nullable().optional(),
})
// GET /unidades?todas= → UnidadeSaida[] (ordem: nome)
// GET /unidades/:id/membros e GET /unidades/sem-membros → MembroSaida[] (ordem: nome; só tipo DBV)

