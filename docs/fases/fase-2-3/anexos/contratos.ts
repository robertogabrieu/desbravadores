// Fases 2 e 3 — contratos novos (zod 4). A onda 0 da PR base copia cada bloco "ARQUIVO:" para
// packages/shared/src/<caminho> sem mudar nomes nem campos — só acrescenta os `import` que a
// divisão exige e a linha em src/index.ts. Mudanças em contratos existentes estão marcadas ALTERA.
// Regra mantida: `.default()` só em contrato de criação/filtro, nunca de edição.
// Conferido com typescript 5.9.3 + zod 4.3.6 (`tsc --noEmit --strict`) contra o shared real.
import { z } from 'zod'
import { Uuid, DataCivil, InstanteIso, TextoCurto } from './comum'
import { Horario, TipoPessoa, StatusMatricula } from '../enums'
import { RefClasse } from './auth'
import { MembroPacote } from './sync'

// ═══════════════ ARQUIVO: enums.ts (ACRESCENTA) ═══════════════
export const TIPOS_EVENTO = ['SEM_REUNIAO', 'ACAMPAMENTO', 'EVENTO', 'FERIADO'] as const
export const TipoEvento = z.enum(TIPOS_EVENTO)
export const STATUS_CRONOGRAMA = ['RASCUNHO', 'ENVIADO', 'PUBLICADO'] as const
export const StatusCronograma = z.enum(STATUS_CRONOGRAMA)
export const ALVOS_OBSERVACAO = ['AULA', 'DBV'] as const
export const AlvoObservacao = z.enum(ALVOS_OBSERVACAO)
export const TIPOS_MATERIAL = ['PDF', 'APRESENTACAO', 'DOCUMENTO', 'LINK'] as const
export const TipoMaterial = z.enum(TIPOS_MATERIAL)
export const TIPOS_NOTIFICACAO = ['CONFLITO_CRONOGRAMA', 'CRONOGRAMA_ENVIADO', 'CRONOGRAMA_PUBLICADO', 'PEDIDO_LIBERAR_CRONOGRAMA'] as const
export const TipoNotificacao = z.enum(TIPOS_NOTIFICACAO)

/** Padrão das três marcações por tipo de evento (editáveis no formulário). */
export const MARCACOES_PADRAO = {
  SEM_REUNIAO: { cancelaReuniao: true, bloqueiaAula: true, bomParaCampo: false },
  EVENTO: { cancelaReuniao: false, bloqueiaAula: true, bomParaCampo: false },
  ACAMPAMENTO: { cancelaReuniao: true, bloqueiaAula: false, bomParaCampo: true },
  FERIADO: { cancelaReuniao: false, bloqueiaAula: false, bomParaCampo: false },
} as const

// ═══════════════ ARQUIVO: contratos/calendario.ts ═══════════════
export const EventoEntrada = z
  .object({
    nome: TextoCurto,
    tipo: TipoEvento,
    inicio: DataCivil,
    fim: DataCivil,
    horario: Horario.nullable(),
    local: z.string().trim().max(120).nullable(),
    cancelaReuniao: z.boolean(),
    bloqueiaAula: z.boolean(),
    bomParaCampo: z.boolean(),
  })
  .refine((e) => e.fim >= e.inicio, { message: 'O fim não pode ser antes do início', path: ['fim'] })
export const EventoSaida = z.object({
  id: Uuid, nome: z.string(), tipo: TipoEvento, inicio: DataCivil, fim: DataCivil,
  horario: Horario.nullable(), local: z.string().nullable(),
  cancelaReuniao: z.boolean(), bloqueiaAula: z.boolean(), bomParaCampo: z.boolean(),
})
export const CalendarioFiltro = z.object({ ano: z.coerce.number().int().min(2000).max(2100) })
export const CalendarioSaida = z.object({
  eventos: z.array(EventoSaida),          // que tocam o ano, ordem por início
  diasDeReuniao: z.array(DataCivil),      // implícitos no ano, já sem os cancelados
})
export const AulaAfetada = z.object({ aulaId: Uuid, cronogramaId: Uuid, classe: RefClasse, data: DataCivil })
/** Resposta de POST /calendario/eventos e PATCH /calendario/eventos/:id. */
export const EventoGravadoSaida = z.object({ evento: EventoSaida, aulasAfetadas: z.array(AulaAfetada) })
// DELETE /calendario/eventos/:id → 204

// ═══════════════ ARQUIVO: contratos/cronograma.ts ═══════════════
export const SITUACOES_AULA = ['DADA', 'HOJE', 'PLANEJADA', 'CONFLITO'] as const
export const RequisitoResumo = z.object({
  id: Uuid, codigo: z.string(), texto: z.string(), campo: z.boolean(), secaoCodigo: z.string(),
})
export const AulaCronograma = z.object({
  id: Uuid,
  data: DataCivil,
  horario: Horario.nullable(),
  local: z.string().nullable(),
  titulo: z.string().nullable(),
  requisitos: z.array(RequisitoResumo),
  /** DADA = tem RegistroAula; CONFLITO = data com evento que bloqueia aula (e sem registro). */
  situacao: z.enum(SITUACOES_AULA),
  registroAulaId: Uuid.nullable(),
})
/** GET /classes/:id/cronograma?anoClube → leitura. Quem monta vê o VIVO; os demais, o PUBLICADO. */
export const CronogramaLeitura = z.object({
  cronogramaId: Uuid.nullable(),        // null = ainda não existe
  classe: RefClasse,
  anoClube: z.number().int(),
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
export const SituacaoData = z.object({
  cancelaReuniao: z.boolean(), bloqueiaAula: z.boolean(), bomParaCampo: z.boolean(),
  eventos: z.array(z.string()), // nomes
})
export const DataMontagem = z.object({
  data: DataCivil,
  aulaId: Uuid.nullable(),
  horario: Horario.nullable(),
  local: z.string().nullable(),
  titulo: z.string().nullable(),
  requisitoIds: z.array(Uuid),
  situacao: SituacaoData,
  /** Tem aula com requisito numa data que bloqueia aula. */
  conflito: z.boolean(),
})
export const RequisitoMontagem = RequisitoResumo.extend({ aulaId: Uuid.nullable(), data: DataCivil.nullable() })
/** GET /classes/:id/cronograma/montagem?anoClube → o cronograma vivo para montar (404 se não existe). */
export const MontagemSaida = z.object({
  cronograma: z.object({
    id: Uuid, status: StatusCronograma, inicio: DataCivil, fim: DataCivil,
    enviadoEm: InstanteIso.nullable(), enviadoPor: z.string().nullable(), publicadoEm: InstanteIso.nullable(),
  }),
  classe: RefClasse,
  /** Individuais: os dias de reunião do período + as datas que já têm aula. Agrupadas: só as datas com aula. */
  datas: z.array(DataMontagem),
  requisitos: z.array(RequisitoMontagem), // todos os ativos da classe (com ajuste do clube), ordem do caderno
  datasLivres: z.boolean(),               // true para Agrupadas
})
export const ColocarRequisitoEntrada = z.object({ data: DataCivil })
export const AulaCriarEntrada = z.object({ data: DataCivil, horario: Horario.nullable(), local: z.string().trim().max(120).nullable(), titulo: z.string().trim().max(80).nullable() })
export const AulaEditarEntrada = z.object({ horario: Horario.nullable(), local: z.string().trim().max(120).nullable(), titulo: z.string().trim().max(80).nullable() }).partial()
// PUT /cronogramas/:id/requisitos/:requisitoId {data} → MontagemSaida · DELETE → MontagemSaida
// POST /cronogramas/:id/aulas → MontagemSaida · PATCH /aulas-planejadas/:id → MontagemSaida
// POST /cronogramas {CronogramaCriarEntrada} → MontagemSaida · PATCH /cronogramas/:id {CronogramaPeriodoEntrada} → MontagemSaida
// POST /cronogramas/:id/enviar → MontagemSaida · POST /cronogramas/:id/publicar → MontagemSaida

// ═══════════════ ARQUIVO: contratos/aulas.ts ═══════════════
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
  /** Marcações que não valeram porque o requisito já estava concluído (vale a data mais antiga). */
  jaConcluidos: z.array(z.object({ dbvId: Uuid, requisitoId: Uuid, concluidoEm: DataCivil })),
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
// GET /classes/:id/aulas?anoClube → AulaResumo[] (data decrescente) · GET /aulas/:id → AulaDetalhe

// ═══════════════ ARQUIVO: contratos/sync.ts (ALTERA PacoteSaida: acrescenta `instrutor`) ═══════════════
export const PacoteInstrutor = z.object({
  classes: z.array(z.object({
    classe: RefClasse,
    membros: z.array(MembroPacote.extend({ tipo: TipoPessoa, concluidos: z.array(Uuid) })), // matrícula CURSANDO no ano
    requisitos: z.array(RequisitoResumo),                  // ativos, com ajuste do clube
    aulasProximas: z.array(z.object({                      // publicadas, próximos 14 dias
      aulaPlanejadaId: Uuid, data: DataCivil, horario: Horario.nullable(), titulo: z.string().nullable(), requisitoIds: z.array(Uuid),
    })),
    registrosRecentes: z.array(z.object({                  // últimos 30 dias
      id: Uuid, data: DataCivil, aulaPlanejadaId: Uuid.nullable(),
      presencas: z.array(z.object({ dbvId: Uuid, presente: z.boolean(), versao: InstanteIso })),
    })),
  })),
  pontosRequisito: z.object({ pontos: z.number().int(), ativo: z.boolean() }),
})
// PacoteSaida ganha: `instrutor: PacoteInstrutor.nullable().default(null)` — preenchido só para INSTRUTOR.
// O default mantém válidos os pacotes e os mocks de teste que ainda não têm o campo.

// ═══════════════ ARQUIVO: contratos/progresso.ts ═══════════════
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

// ═══════════════ ARQUIVO: contratos/especialidades.ts (ACRESCENTA) ═══════════════
export const EspecialidadesDoDbvSaida = z.object({
  dbvId: Uuid,
  concluidas: z.array(z.object({
    especialidadeId: Uuid, concluidaEm: DataCivil, marcadoPor: z.string(), podeDesmarcar: z.boolean(),
  })),
})
export const EspecialidadeClubeEntrada = z.object({ areaId: Uuid, nome: TextoCurto })
// GET /desbravadores/:id/especialidades → EspecialidadesDoDbvSaida
// PUT /desbravadores/:id/especialidades/:especialidadeId {concluidoEm} → EspecialidadesDoDbvSaida · DELETE → idem
// POST /especialidades {EspecialidadeClubeEntrada} (Fase 3) → AreaComEspecialidades[]

// ═══════════════ ARQUIVO: contratos/observacoes.ts ═══════════════
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
    message: 'Escolha a aula ou o desbravador', path: ['alvo'],
  })
export const ObservacaoEditarEntrada = z.object({ titulo: z.string().trim().max(80).nullable(), texto: z.string().trim().min(1).max(4000) }).partial()
export const ObservacaoFiltro = z.object({ classeId: Uuid, alvo: AlvoObservacao.optional(), dbvId: Uuid.optional() })
export const ObservacaoSaida = z.object({
  id: Uuid, classeId: Uuid, alvo: AlvoObservacao,
  aula: z.object({ id: Uuid, data: DataCivil }).nullable(),
  dbv: z.object({ id: Uuid, nome: z.string() }).nullable(),
  titulo: z.string().nullable(), texto: z.string(),
  autor: z.string(), criadaEm: InstanteIso, editadaEm: InstanteIso.nullable(),
  podeEditar: z.boolean(),
})
// GET /observacoes?classeId&alvo&dbvId → ObservacaoSaida[] (criadaEm ↓) · POST → ObservacaoSaida 201
// PATCH /observacoes/:id → ObservacaoSaida · DELETE → 204

// ═══════════════ ARQUIVO: contratos/materiais.ts ═══════════════
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

// ═══════════════ ARQUIVO: contratos/instrutor.ts ═══════════════
export const ClasseDoInstrutor = z.object({
  classe: RefClasse,
  totalDbvs: z.number().int(),
  progressoMedio: z.number().int().nullable(),
  proximaAula: z.object({ aulaId: Uuid, data: DataCivil, horario: Horario.nullable(), titulo: z.string().nullable(), totalRequisitos: z.number().int() }).nullable(),
  aulaHoje: z.boolean(),
  aulaHojeRegistrada: z.boolean(),
  aulasDadas: z.number().int(),   // RegistroAula no ano do clube
})
export const InicioInstrutorSaida = z.object({
  classes: z.array(ClasseDoInstrutor), // individuais por ordem, depois Agrupadas
  /** DBVs que faltaram às 2 últimas aulas registradas da classe. */
  alertaFaltas: z.array(z.object({ classe: RefClasse, dbvs: z.array(z.object({ dbvId: Uuid, nome: z.string() })) })),
})
// GET /inicio/instrutor → InicioInstrutorSaida · POST /classes/:id/pedir-liberacao → 204

// ═══════════════ ARQUIVO: contratos/notificacoes.ts ═══════════════
export const NotificacaoSaida = z.object({
  id: Uuid, tipo: TipoNotificacao, titulo: z.string(), texto: z.string(), link: z.string(),
  criadaEm: InstanteIso, lida: z.boolean(),
})
export const NotificacoesSaida = z.object({ itens: z.array(NotificacaoSaida), naoLidas: z.number().int() })
// GET /notificacoes → NotificacoesSaida (últimas 50) · POST /notificacoes/:id/lida → 204 · POST /notificacoes/lidas → 204

// ═══════════════ ARQUIVO: contratos/visao-geral.ts ═══════════════
export const AtividadeSaida = z.object({ id: Uuid, descricao: z.string(), link: z.string().nullable(), criadaEm: InstanteIso, autor: z.string().nullable() })
export const VisaoGeralSaida = z.object({
  dbvsAtivos: z.number().int(),
  variacaoTrimestre: z.number().int(),        // ativos hoje − ativos há 3 meses
  unidades: z.number().int(),
  instrutores: z.number().int(),
  classesCobertas: z.number().int(),           // classes ativas com pelo menos um instrutor
  frequenciaMes: z.number().int().nullable(),
  variacaoFrequencia: z.number().int().nullable(), // pontos percentuais vs mês anterior
  especialidadesAno: z.number().int(),
  especialidadesPorDbv: z.number(),
  progressoClasses: z.array(z.object({ classe: RefClasse, media: z.number().int().nullable(), totalDbvs: z.number().int(), instrutores: z.array(z.string()) })),
  unidadesResumo: z.array(z.object({ id: Uuid, nome: z.string(), conselheiros: z.array(z.string()), totalDbvs: z.number().int(), frequenciaMes: z.number().int().nullable() })),
  cronogramasEnviados: z.array(z.object({ cronogramaId: Uuid, classe: RefClasse, enviadoPor: z.string(), enviadoEm: InstanteIso })),
  atividades: z.array(AtividadeSaida).max(10),
})
// GET /visao-geral → VisaoGeralSaida

// ═══════════════ ARQUIVO: contratos/clube.ts ═══════════════
export const ConfiguracaoClubeEntrada = z.object({
  diaReuniao: z.number().int().min(0).max(6),
  horaReuniao: Horario,
  localReuniaoPadrao: z.string().trim().max(120).nullable(),
  limiarFrequenciaAlerta: z.number().int().min(0).max(100),
  limiarProgressoAlerta: z.number().int().min(0).max(100),
  metaFrequencia: z.number().int().min(0).max(100),
}).partial()
export const ConfiguracaoClubeSaida = z.object({
  diaReuniao: z.number().int(), horaReuniao: Horario, localReuniaoPadrao: z.string().nullable(),
  limiarFrequenciaAlerta: z.number().int(), limiarProgressoAlerta: z.number().int(), metaFrequencia: z.number().int(),
  fuso: z.string(), inicioAnoClube: z.string(),
})
// GET /clube/configuracao → ConfiguracaoClubeSaida · PATCH → ConfiguracaoClubeSaida

// ═══════════════ ARQUIVO: contratos/classes.ts (ACRESCENTA — ajustes do clube, Fase 3) ═══════════════
export const ClasseClubeEditarEntrada = z.object({ ativa: z.boolean(), quemMontaCronograma: z.enum(['ADM', 'INSTRUTOR']) }).partial()
/** null = volta a seguir o oficial. */
export const RequisitoAjusteEntrada = z.object({ ativo: z.boolean().nullable(), campo: z.boolean().nullable() }).partial()
// PATCH /classes/:id {ClasseClubeEditarEntrada} → ClasseDetalheSaida
// PATCH /requisitos/:id/ajuste {RequisitoAjusteEntrada} → ClasseDetalheSaida
