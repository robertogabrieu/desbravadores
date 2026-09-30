import { z } from 'zod'
import { Origem, QuemMonta, TipoClasse, Trilha } from '../enums'
import { Uuid } from './comum'

export const ClasseFiltro = z.object({ trilha: Trilha.optional(), tipo: TipoClasse.optional() })
export const ClasseSaida = z.object({
  id: Uuid,
  nome: z.string(),
  idade: z.number().int().nullable(),
  tipo: TipoClasse,
  trilha: Trilha,
  origem: Origem,
  classeBaseId: Uuid.nullable(),
  ordem: z.number().int(),
  /** Token CSS: "--classe-amigo"… ; avançada herda da regular; Agrupadas e CLUBE: "--color-primary". */
  corToken: z.string(),
  ativa: z.boolean(),               // de ClasseClube
  quemMontaCronograma: QuemMonta,   // de ClasseClube
  totalRequisitos: z.number().int(), // ativos, com o ajuste do clube aplicado
})
export const RequisitoSaida = z.object({
  id: Uuid, codigo: z.string(), texto: z.string(), campo: z.boolean(), ativo: z.boolean(),
  /** Preenchidos em GET /classes/:id para quem tem classe.gerenciar. */
  oficial: z.object({ ativo: z.boolean(), campo: z.boolean() }).optional(),
  ajustado: z.boolean().optional(),
})
export const ClasseDetalheSaida = ClasseSaida.extend({
  secoes: z.array(z.object({
    id: Uuid, codigo: z.string(), nome: z.string(), ordem: z.number().int(),
    requisitos: z.array(RequisitoSaida),
  })),
})
// GET /classes → ClasseSaida[] (ordem: ordem ascendente)

export const ClasseClubeEditarEntrada = z.object({ ativa: z.boolean(), quemMontaCronograma: z.enum(['ADM', 'INSTRUTOR']) }).partial()
/** null = volta a seguir o oficial. */
export const RequisitoAjusteEntrada = z.object({ ativo: z.boolean().nullable(), campo: z.boolean().nullable() }).partial()
// PATCH /classes/:id {ClasseClubeEditarEntrada} → ClasseDetalheSaida
// PATCH /requisitos/:id/ajuste {RequisitoAjusteEntrada} → ClasseDetalheSaida
