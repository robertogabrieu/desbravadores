import { z } from 'zod'
import { StatusMatricula, TipoPessoa } from '../enums'
import { RefClasse } from './auth'
import { DataCivil, Uuid } from './comum'
import { RequisitoResumo } from './cronograma'

export const ProgressoClasseFiltro = z.object({ anoClube: z.coerce.number().int().optional() })
export const ProgressoClasseSaida = z.object({
  classe: RefClasse,
  anoClube: z.number().int(),
  totalRequisitos: z.number().int(),
  media: z.number().int().nullable(),          // mediaTurma; null sem matriculados
  prontos: z.number().int(),                   // REGULAR: 100%
  concluiramAvancada: z.number().int(),        // AVANCADA: 100%
  abaixoDoLimiar: z.number().int(),            // < limiarProgressoAlerta
  itens: z.array(z.object({
    dbvId: Uuid, nome: z.string(), tipo: TipoPessoa, status: StatusMatricula,
    concluidos: z.number().int(), percentual: z.number().int(), faltam: z.number().int(),
  })), // matrículas CURSANDO, CONCLUIDA e INVESTIDA; ordem: percentual ↓, nome ↑
})
export const RequisitoDoDbv = RequisitoResumo.extend({
  concluidoEm: DataCivil.nullable(),
  marcadoPor: z.string().nullable(),
  podeMarcar: z.boolean(),
})
export const ProgressoDbvSaida = z.object({
  matriculas: z.array(z.object({
    classe: RefClasse,
    anoClube: z.number().int(),
    status: StatusMatricula,
    percentual: z.number().int(),
    concluidos: z.number().int(),
    total: z.number().int(),
    secoes: z.array(z.object({
      codigo: z.string(), nome: z.string(), concluidos: z.number().int(), total: z.number().int(),
      requisitos: z.array(RequisitoDoDbv),
    })),
  })), // ano corrente: regular primeiro, depois a avançada ligada; depois as outras trilhas
})
export const MarcarConclusaoEntrada = z.object({ concluidoEm: DataCivil })
// GET /classes/:id/progresso → ProgressoClasseSaida · GET /desbravadores/:id/progresso → ProgressoDbvSaida
// PUT /desbravadores/:id/requisitos/:requisitoId {MarcarConclusaoEntrada} → ProgressoDbvSaida · DELETE → ProgressoDbvSaida
