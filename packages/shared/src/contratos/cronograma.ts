import { z } from 'zod'
import { Horario, StatusCronograma } from '../enums'
import { RefClasse } from './auth'
import { DataCivil, InstanteIso, Uuid } from './comum'

export const SITUACOES_AULA = ['DADA', 'HOJE', 'PLANEJADA', 'NAO_REGISTRADA', 'CONFLITO'] as const
export const RequisitoResumo = z.object({
  id: Uuid, codigo: z.string(), texto: z.string(), campo: z.boolean(), secaoCodigo: z.string(),
})
export const AulaCronograma = z.object({
  /** EXTRA = RegistroAula sem aula planejada (reposição/aula extra): `id` null, situação DADA. */
  origem: z.enum(['PLANEJADA', 'EXTRA']),
  id: Uuid.nullable(),
  data: DataCivil,
  horario: Horario.nullable(),
  local: z.string().nullable(),
  titulo: z.string().nullable(),
  requisitos: z.array(RequisitoResumo),
  /** Fórmula `situacaoDaAula` (base §3): DADA, CONFLITO, HOJE, NAO_REGISTRADA (passou sem registro), PLANEJADA. */
  situacao: z.enum(SITUACOES_AULA),
  registroAulaId: Uuid.nullable(),
})
/** GET /classes/:id/cronograma?anoClube → leitura. Quem monta vê o VIVO; os demais, o PUBLICADO. */
export const CronogramaLeitura = z.object({
  cronogramaId: Uuid.nullable(),        // null = ainda não existe
  classe: RefClasse,
  anoClube: z.number().int(),
  /** Para quem vê o PUBLICADO, sempre 'PUBLICADO' (o estado do vivo não é exposto). */
  status: StatusCronograma.nullable(),
  fonte: z.enum(['VIVO', 'PUBLICADO']).nullable(),
  publicadoEm: InstanteIso.nullable(),
  podeMontar: z.boolean(),
  aulas: z.array(AulaCronograma),       // ordem por data
})
export const CronogramaLeituraFiltro = z.object({ anoClube: z.coerce.number().int().optional() }) // padrão: ano corrente

// — montagem (Fase 3) —
export const CronogramaCriarEntrada = z
  .object({ classeId: Uuid, anoClube: z.number().int(), inicio: DataCivil, fim: DataCivil })
  .refine((c) => c.fim >= c.inicio, { message: 'O fim não pode ser antes do início', path: ['fim'] })
export const CronogramaPeriodoEntrada = z
  .object({ inicio: DataCivil, fim: DataCivil })
  .refine((c) => c.fim >= c.inicio, { message: 'O fim não pode ser antes do início', path: ['fim'] })
/** A Reunião extra que cobre a data (no máximo uma). */
export const ExtraDoDia = z.object({
  nome: z.string(), temReuniao: z.boolean(), temClasse: z.boolean(), horario: Horario.nullable(), local: z.string().nullable(),
})
export const SituacaoData = z.object({
  reuniaoMantida: z.boolean(), classeLiberada: z.boolean(), bomParaCampo: z.boolean(),
  temReuniao: z.boolean(), temClasse: z.boolean(), ferias: z.boolean(),
  extra: ExtraDoDia.nullable(),
  eventos: z.array(z.string()), // nomes, inclusive o da extra
})
export const DataMontagem = z.object({
  data: DataCivil,
  aulaId: Uuid.nullable(),
  horario: Horario.nullable(),
  local: z.string().nullable(),
  titulo: z.string().nullable(),
  requisitoIds: z.array(Uuid),
  situacao: SituacaoData,
  /** Função única `emConflito` (base §3). */
  conflito: z.boolean(),
  /** A aula da data já tem registro: não pode ser editada, movida nem removida. */
  aulaDada: z.boolean(),
})
export const RequisitoMontagem = RequisitoResumo.extend({ aulaId: Uuid.nullable(), data: DataCivil.nullable() })
/** GET /classes/:id/cronograma/montagem?anoClube → o cronograma vivo. Sem cronograma: `cronograma`
 *  null e listas vazias (a tela oferece "Criar"); classe fora do escopo: 404. */
export const MontagemSaida = z.object({
  cronograma: z.object({
    id: Uuid, status: StatusCronograma, inicio: DataCivil, fim: DataCivil,
    enviadoEm: InstanteIso.nullable(), enviadoPor: z.string().nullable(), publicadoEm: InstanteIso.nullable(),
    /** Enviado de volta em enviar/publicar para detectar que o cronograma mudou (409). */
    atualizadoEm: InstanteIso,
  }).nullable(),
  classe: RefClasse,
  /** Individuais: os dias de reunião do período + as datas que já têm aula. Agrupadas: só as datas com aula. */
  datas: z.array(DataMontagem),
  requisitos: z.array(RequisitoMontagem), // todos os ativos da classe (com ajuste do clube), ordem do caderno
  datasLivres: z.boolean(),               // true para Agrupadas
})
export const ColocarRequisitoEntrada = z.object({ data: DataCivil })
export const EnviarPublicarEntrada = z.object({ atualizadoEmVisto: InstanteIso })
export const AulaCriarEntrada = z.object({ data: DataCivil, horario: Horario.nullable(), local: z.string().trim().max(120).nullable(), titulo: z.string().trim().max(80).nullable() })
export const AulaEditarEntrada = z.object({ horario: Horario.nullable(), local: z.string().trim().max(120).nullable(), titulo: z.string().trim().max(80).nullable() }).partial()
// PUT /cronogramas/:id/requisitos/:requisitoId {data} → MontagemSaida · DELETE → MontagemSaida
// POST /cronogramas/:id/aulas → MontagemSaida · PATCH /aulas-planejadas/:id → MontagemSaida
// POST /cronogramas {CronogramaCriarEntrada} → MontagemSaida · PATCH /cronogramas/:id {CronogramaPeriodoEntrada} → MontagemSaida
// POST /cronogramas/:id/enviar {EnviarPublicarEntrada} → MontagemSaida · POST /cronogramas/:id/publicar {idem} → MontagemSaida
