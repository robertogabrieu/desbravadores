import { z } from 'zod'
import { RefClasse } from './auth'
import { DataCivil, InstanteIso, Uuid } from './comum'
import { RequisitoResumo } from './cronograma'

export const PresencaEnvio = z.object({ dbvId: Uuid, presente: z.boolean(), versaoVista: InstanteIso.nullable() })
export const MarcaRequisito = z.object({ dbvId: Uuid, requisitoId: Uuid })
/** Item de tarefa: um requisito da classe OU uma especialidade — nunca os dois (o banco tem CHECK). */
export const ItemTarefa = z.union([z.object({ requisitoId: Uuid }).strict(), z.object({ especialidadeId: Uuid }).strict()])
export const MarcaEspecialidade = z.object({ dbvId: Uuid, especialidadeId: Uuid })
/** PUT /api/sync/aulas/:uuid. Nova: `presencas` traz TODOS os matriculados. Correção: só as tocadas. */
export const AulaEnvio = z.object({
  /** Segue 1: os campos novos têm padrão e itens antigos da fila continuam válidos. */
  versaoPayload: z.literal(1),
  envioId: Uuid,
  classeId: Uuid,
  data: DataCivil,
  feitaNoAparelhoEm: InstanteIso,
  aulaPlanejadaId: Uuid.nullable(),
  presencas: z.array(PresencaEnvio).max(200),
  requisitosMarcados: z.array(MarcaRequisito).max(2000),
  requisitosDesmarcados: z.array(MarcaRequisito).max(2000),
  /** Tarefa para casa passada NESTE registro; o id vem do aparelho no primeiro envio. */
  tarefaId: Uuid.nullable().default(null),
  tarefaItensAcrescentados: z.array(ItemTarefa).max(100).default([]),
  tarefaItensRetirados: z.array(ItemTarefa).max(100).default([]),
  /** Entregas de especialidade cobradas neste registro (e as desfeitas). */
  especialidadesMarcadas: z.array(MarcaEspecialidade).max(2000).default([]),
  especialidadesDesmarcadas: z.array(MarcaEspecialidade).max(2000).default([]),
  tarefasEncerradas: z.array(Uuid).max(50).default([]),
})
export const AulaEnvioSaida = z.object({
  registroAulaId: Uuid,
  presencas: z.array(z.object({ dbvId: Uuid, versao: InstanteIso })),
  conflitos: z.array(z.object({ dbvId: Uuid, nome: z.string() })),
  ignorados: z.array(z.object({ dbvId: Uuid, nome: z.string() })),
  /** Marcações sem efeito: já concluído (a data mais antiga vale — pode mover a conclusão para esta
   *  aula), requisito que deixou de ser da classe ou ficou inativo, DBV ausente no próprio envio, ou
   *  ficha ligada à conta de quem envia (outro instrutor ou o Adm registra). */
  requisitosSemEfeito: z.array(z.object({
    dbvId: Uuid, requisitoId: Uuid,
    motivo: z.enum(['JA_CONCLUIDO', 'REQUISITO_INVALIDO', 'AUSENTE', 'PROPRIA_FICHA']),
    concluidoEm: DataCivil.nullable(),
  })),
  /** Avisos que não recusam o envio (ex.: a aula planejada saiu do cronograma publicado). */
  avisos: z.array(z.string()),
  /** Soma dos pontos de requisito e de especialidade concluídos neste registro. */
  totalPontos: z.number().int(),
  /** Id real da tarefa deste registro (a fila corrige os itens seguintes, como faz com o registro). */
  tarefaId: Uuid.nullable(),
  tarefaItensSemEfeito: z.array(z.object({ item: ItemTarefa, motivo: z.enum(['ITEM_INVALIDO', 'JA_EM_TAREFA', 'SEM_PERMISSAO']) })),
  especialidadesSemEfeito: z.array(z.object({
    dbvId: Uuid, especialidadeId: Uuid,
    motivo: z.enum(['JA_CONCLUIDA', 'ESPECIALIDADE_INVALIDA', 'AUSENTE', 'PROPRIA_FICHA', 'SEM_PERMISSAO']),
    concluidaEm: DataCivil.nullable(),
  })),
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
