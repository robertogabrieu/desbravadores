import { z } from 'zod'
import { RefClasse } from './auth'
import { DataCivil, InstanteIso, Uuid } from './comum'
import { RequisitoResumo } from './cronograma'

export const PresencaEnvio = z.object({ dbvId: Uuid, presente: z.boolean(), versaoVista: InstanteIso.nullable() })
export const MarcaRequisito = z.object({ dbvId: Uuid, requisitoId: Uuid })
/** PUT /api/sync/aulas/:uuid. Nova: `presencas` traz TODOS os matriculados. Correção: só as tocadas. */
export const AulaEnvio = z.object({
  versaoPayload: z.literal(1),
  envioId: Uuid,
  classeId: Uuid,
  data: DataCivil,
  feitaNoAparelhoEm: InstanteIso,
  aulaPlanejadaId: Uuid.nullable(),
  presencas: z.array(PresencaEnvio).max(200),
  requisitosMarcados: z.array(MarcaRequisito).max(2000),
  requisitosDesmarcados: z.array(MarcaRequisito).max(2000),
})
export const AulaEnvioSaida = z.object({
  registroAulaId: Uuid,
  presencas: z.array(z.object({ dbvId: Uuid, versao: InstanteIso })),
  conflitos: z.array(z.object({ dbvId: Uuid, nome: z.string() })),
  ignorados: z.array(z.object({ dbvId: Uuid, nome: z.string() })),
  /** Marcações sem efeito: já concluído (a data mais antiga vale — pode mover a conclusão para esta
   *  aula), requisito que deixou de ser da classe ou ficou inativo, ou DBV ausente no próprio envio. */
  requisitosSemEfeito: z.array(z.object({
    dbvId: Uuid, requisitoId: Uuid,
    motivo: z.enum(['JA_CONCLUIDO', 'REQUISITO_INVALIDO', 'AUSENTE']),
    concluidoEm: DataCivil.nullable(),
  })),
  /** Avisos que não recusam o envio (ex.: a aula planejada saiu do cronograma publicado). */
  avisos: z.array(z.string()),
  totalPontos: z.number().int(),
})
export const AulaResumo = z.object({
  id: Uuid, data: DataCivil, presentes: z.number().int(), total: z.number().int(), requisitosConcluidos: z.number().int(),
})
export const AulaDetalhe = z.object({
  id: Uuid,
  classe: RefClasse,
  data: DataCivil,
  aulaPlanejadaId: Uuid.nullable(),
  registradoPor: z.string(),
  presencas: z.array(z.object({ dbvId: Uuid, nome: z.string(), presente: z.boolean(), versao: InstanteIso })),
  requisitosDaAula: z.array(RequisitoResumo),     // planejados + os marcados nela (reposição)
  concluidosNaAula: z.array(MarcaRequisito),
  podeEditar: z.boolean(),
})
export const AulasFiltro = z.object({ anoClube: z.coerce.number().int().optional() })
// GET /classes/:id/aulas?anoClube → AulaResumo[] (data decrescente) · GET /aulas/:id → AulaDetalhe
