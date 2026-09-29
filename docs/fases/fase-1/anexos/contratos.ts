// Fase 1 — contratos novos (zod 4). A onda 1a-0 copia cada bloco "ARQUIVO:" para
// packages/shared/src/<caminho> sem mudar nomes nem campos — só acrescenta os `import` que a
// divisão exige e a linha em src/index.ts. Mudanças em contratos da Fase 0 estão marcadas ALTERA.
// Regra da Fase 0 mantida: `.default()` só em contrato de criação/filtro, nunca de edição.
// Conferido com typescript 5.9.3 + zod 4.3.6 (`tsc --noEmit --strict`) contra o shared real.
import { z } from 'zod'
import { Uuid, DataCivil, InstanteIso } from './comum'
import { Sexo } from '../enums'
import { RefUnidade, RefClasse } from './auth'
import { DesbravadorSaida } from './desbravadores'

// ═══════════════ ARQUIVO: enums.ts (ACRESCENTA ao arquivo existente) ═══════════════
export const SITUACOES_CHAMADA = ['PRESENTE', 'ATRASADO', 'FALTA', 'FALTA_JUSTIFICADA'] as const
export const SituacaoChamadaZ = z.enum(SITUACOES_CHAMADA) // formulas/situacao.ts passa a derivar o tipo daqui
export const ORIGENS_ALTERACAO = ['EDICAO', 'CONFLITO_SYNC'] as const

/** "AAAA-MM" */
export const MesCivil = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido')
/** "HH:MM" 24 h */
export const Horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido')

// ═══════════════ ARQUIVO: contratos/reunioes.ts ═══════════════
export const MarcacaoChamada = z
  .object({
    dbvId: Uuid,
    situacao: SituacaoChamadaZ,
    uniforme: z.boolean(),
    biblia: z.boolean(),
    licao: z.boolean(),
    /** Relógio do aparelho no momento em que ESTA linha foi mexida pela última vez. */
    alteradaNoAparelhoEm: InstanteIso,
  })
  .refine((m) => m.situacao === 'PRESENTE' || m.situacao === 'ATRASADO' || (!m.uniforme && !m.biblia && !m.licao), {
    message: 'Ausente não tem uniforme, Bíblia nem Lição', path: ['situacao'],
  })

/** PUT /api/sync/reunioes/:uuid — a chamada inteira, sempre. */
export const ReuniaoEnvio = z.object({
  unidadeId: Uuid,
  data: DataCivil,
  horario: Horario,
  local: z.string().trim().max(120).nullable(),
  observacoes: z.string().trim().max(2000).nullable(),
  observacoesAlteradasEm: InstanteIso,
  chamada: z.array(MarcacaoChamada).min(1).max(200),
})
export const ReuniaoEnvioSaida = z.object({
  reuniaoId: Uuid,         // pode diferir do :uuid se a (unidade, data) já existia
  pontos: z.array(z.object({ dbvId: Uuid, pontos: z.number().int() })),
  totalPontos: z.number().int(),
  linhasSobrescritas: z.number().int(), // linhas do servidor mais novas que venceram as do envio
  /** DBVs do envio que não eram membros DBV ativos da unidade na data (lista do aparelho desatualizada). */
  ignorados: z.array(Uuid),
})

export const ReuniaoFiltro = z.object({ unidadeId: Uuid, mes: MesCivil })
export const ReuniaoResumo = z.object({
  id: Uuid,
  data: DataCivil,
  horario: Horario,
  presentes: z.number().int(),   // PRESENTE + ATRASADO
  total: z.number().int(),       // linhas da chamada (membros na data)
  atrasos: z.number().int(),
  uniformes: z.number().int(),
  biblias: z.number().int(),
  percentual: z.number().int().nullable(), // round(presentes/total*100); null se total 0
  alterada: z.boolean(),
})
// GET /api/reunioes?unidadeId&mes → ReuniaoResumo[] (ordem: data decrescente)

export const LinhaChamadaSaida = z.object({
  dbvId: Uuid,
  nome: z.string(),
  nomePublico: z.string(),
  situacao: SituacaoChamadaZ,
  uniforme: z.boolean(),
  biblia: z.boolean(),
  licao: z.boolean(),
  pontos: z.number().int(),   // soma dos lançamentos ativos desta linha (servidor)
})
export const ReuniaoDetalhe = z.object({
  id: Uuid,
  unidade: RefUnidade,
  data: DataCivil,
  horario: Horario,
  local: z.string().nullable(),
  observacoes: z.string().nullable(),
  registradaPor: z.object({ nome: z.string() }),
  registradaEm: InstanteIso,
  alterada: z.object({ por: z.string(), em: InstanteIso }).nullable(), // última alteração depois do registro
  podeEditar: z.boolean(),    // regra de prazo (SPEC §6.4) já aplicada
  chamada: z.array(LinhaChamadaSaida), // ordem: nome
  totais: z.object({
    presentes: z.number().int(), total: z.number().int(), atrasos: z.number().int(),
    uniformes: z.number().int(), biblias: z.number().int(), pontos: z.number().int(),
  }),
  album: z.object({ id: Uuid, totalFotos: z.number().int() }).nullable(),
})

export const MARCAS_GRADE = ['P', 'A', 'F', 'J'] as const
export const GradeFrequenciaSaida = z.object({
  reunioes: z.array(z.object({ id: Uuid, data: DataCivil })), // as últimas N, da mais antiga à mais recente
  linhas: z.array(z.object({
    dbvId: Uuid,
    nome: z.string(),
    marcas: z.array(z.enum(MARCAS_GRADE).nullable()), // null = não era membro na data
    percentual: z.number().int().nullable(),
  })),
})
// GET /api/unidades/:id/frequencia?ultimas=8 → GradeFrequenciaSaida (ultimas: 1..20, padrão 8)
export const GradeFrequenciaFiltro = z.object({ ultimas: z.coerce.number().int().min(1).max(20).default(8) })

// ═══════════════ ARQUIVO: contratos/sync.ts ═══════════════
export const MembroPacote = z.object({
  dbvId: Uuid,
  nome: z.string(),
  nomePublico: z.string(),
  sexo: Sexo,
  idade: z.number().int(),
  classeAtual: RefClasse.nullable(),
  autorizacaoImagem: z.boolean(),
})
export const PacoteSaida = z.object({
  /** Muda sempre que qualquer dado do pacote muda (hash do conteúdo). */
  versao: z.string(),
  geradoEm: InstanteIso,
  usuarioId: Uuid,
  vinculoId: Uuid,
  clube: z.object({
    id: Uuid, nome: z.string(), fuso: z.string(),
    diaReuniao: z.number().int().min(0).max(6), horaReuniao: Horario, localReuniaoPadrao: z.string().nullable(),
    descontarFalta: z.boolean(), pontosDescontoFalta: z.number().int(),
  }),
  /** Critérios de gatilho de chamada (PRESENCA…LICAO), ativos e inativos, para a conta provisória. */
  criterios: z.array(z.object({
    gatilho: z.enum(['PRESENCA', 'PONTUALIDADE', 'UNIFORME', 'BIBLIA', 'LICAO']),
    nome: z.string(), pontos: z.number().int(), ativo: z.boolean(),
  })),
  unidades: z.array(z.object({ id: Uuid, nome: z.string(), membros: z.array(MembroPacote) })),
  /** Reuniões dos últimos 30 dias das unidades do usuário, com a chamada — para corrigir sem internet. */
  reunioesRecentes: z.array(z.object({
    id: Uuid, unidadeId: Uuid, data: DataCivil, horario: Horario,
    local: z.string().nullable(), observacoes: z.string().nullable(),
    chamada: z.array(MarcacaoChamada),
  })),
  /** Álbuns dos últimos 60 dias, para enviar foto a um álbum existente sem internet. */
  albunsRecentes: z.array(z.object({
    id: Uuid, unidadeId: Uuid, titulo: z.string(), data: DataCivil, reuniaoId: Uuid.nullable(),
  })),
})
// GET /api/sync/pacote → PacoteSaida (CONSELHEIRO; ADM e INSTRUTOR recebem unidades: [] nesta fase)

// ═══════════════ ARQUIVO: contratos/fotos.ts ═══════════════
/** Campo `dados` (JSON) do multipart de PUT /api/sync/fotos/:uuid; o campo `arquivo` é o JPEG. */
export const FotoEnvioDados = z.object({
  album: z.object({
    id: Uuid,                      // existente, ou novo gerado no aparelho
    unidadeId: Uuid,
    titulo: z.string().trim().min(1).max(80),
    data: DataCivil,
    reuniaoId: Uuid.nullable(),
  }),
  legenda: z.string().trim().max(300).nullable(),
})
export const FotoEnvioSaida = z.object({ fotoId: Uuid, albumId: Uuid })

export const AlbumFiltro = z.object({ unidadeId: Uuid })
export const AlbumResumo = z.object({
  id: Uuid,
  titulo: z.string(),
  data: DataCivil,
  reuniaoId: Uuid.nullable(),
  totalFotos: z.number().int(),
  capaUrl: z.string().nullable(),   // URL assinada da miniatura da foto mais recente
  enviadoPor: z.array(z.string()),  // nomes distintos de quem enviou
})
// GET /api/albuns?unidadeId → AlbumResumo[] (ordem: data decrescente; só álbuns com foto)

export const FotoSaida = z.object({
  id: Uuid,
  legenda: z.string().nullable(),
  enviadaPor: z.string(),
  enviadaEm: InstanteIso,
  url: z.string(),          // assinada, 10 min
  miniaturaUrl: z.string(), // assinada, 10 min
  podeRemover: z.boolean(),
})
export const AlbumDetalhe = z.object({
  id: Uuid, titulo: z.string(), data: DataCivil, unidade: RefUnidade, reuniaoId: Uuid.nullable(),
  fotos: z.array(FotoSaida), // ordem: enviadaEm crescente
})
export const SemAutorizacaoSaida = z.object({ nomes: z.array(z.string()) }) // nomePublico, ordem alfabética

// ═══════════════ ARQUIVO: contratos/ranking.ts ═══════════════
export const RankingFiltro = z.object({
  mes: MesCivil.optional(),  // padrão: mês corrente no fuso do clube
  unidadeId: Uuid.optional(),
})
export const RankingItem = z.object({
  posicao: z.number().int(),
  dbvId: Uuid,
  nome: z.string(),
  unidade: RefUnidade.nullable(),
  classe: RefClasse.nullable(),
  pontos: z.number().int(),
  frequencia: z.number().int().nullable(),
  /** true = quem pede pode abrir o perfil (está no escopo dele). */
  abrePerfil: z.boolean(),
})
export const RankingSaida = z.object({ mes: MesCivil, itens: z.array(RankingItem) })
export const RankingUnidadesSaida = z.array(z.object({
  posicao: z.number().int(), unidade: RefUnidade, mediaPontos: z.number(), totalDbvs: z.number().int(),
}))
// GET /api/ranking?mes&unidadeId → RankingSaida · GET /api/ranking/unidades?mes → RankingUnidadesSaida

// ═══════════════ ARQUIVO: contratos/perfil.ts ═══════════════
export const PerfilDbvSaida = z.object({
  dbv: DesbravadorSaida,              // `contato` só com dbv.ver_contato (regra da Fase 0)
  mes: MesCivil,
  posicaoMes: z.number().int().nullable(),
  pontosMes: z.number().int(),
  frequenciaMes: z.number().int().nullable(),
  classesInvestidas: z.array(z.object({ classe: RefClasse, anoClube: z.number().int() })),
})
// GET /api/desbravadores/:id/perfil → PerfilDbvSaida

// ═══════════════ ARQUIVO: contratos/inicio.ts ═══════════════
export const InicioConselheiroFiltro = z.object({ unidadeId: Uuid.optional() })
export const InicioConselheiroSaida = z.object({
  unidade: RefUnidade,
  unidades: z.array(RefUnidade), // todas as do conselheiro, para o seletor
  proximaReuniao: z.object({
    data: DataCivil, horario: Horario, local: z.string().nullable(),
    ehHoje: z.boolean(), chamadaFeita: z.boolean(),
  }),
  totalDbvs: z.number().int(),
  frequenciaMes: z.number().int().nullable(),
  posicaoUnidade: z.object({ posicao: z.number().int(), total: z.number().int() }).nullable(),
  destaques: z.array(z.object({ posicao: z.number().int(), dbvId: Uuid, nome: z.string(), pontos: z.number().int() })).max(3),
})
// GET /api/inicio/conselheiro?unidadeId → InicioConselheiroSaida

// ═══════════════ ARQUIVO: contratos/pedidos.ts ═══════════════
export const PedidoAoAdmEntrada = z.object({ tipo: z.literal('UNIDADE_SEM_DBV'), unidadeId: Uuid })
// POST /api/pedidos-ao-adm → 204 (e-mail a cada Adm ativo; 1 por unidade por dia, repetição → 204 sem enviar)

// ═══════════════ ARQUIVO: contratos/unidades.ts (ALTERA MembroSaida) ═══════════════
// MembroSaida ganha `frequencia: z.number().int().nullable().optional()` — preenchida em
// GET /api/unidades/:id/membros quando quem pede tem `reuniao.ver` (frequência do mês corrente).
