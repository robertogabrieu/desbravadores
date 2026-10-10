import { z } from 'zod'
import { Horario } from '../enums'
import { DataCivil, InstanteIso, TextoCurto, Uuid } from './comum'

const DiaSemana = z.number().int().min(0).max(6)
const Local = z.string().trim().max(120).nullable()
const LinkHttps = z.url({ protocol: /^https$/, message: 'Use um link https://' })

/** Derivada, nunca guardada: não terminada até a etapa 3; em andamento até o fim; encerrada depois. */
export const SITUACOES_EDICAO_CB = ['NAO_TERMINADA', 'EM_ANDAMENTO', 'ENCERRADA'] as const
export const SituacaoEdicaoCB = z.enum(SITUACOES_EDICAO_CB)
export const GATILHOS_CB = ['CLASSE_BIBLICA_PRESENCA', 'CLASSE_BIBLICA_PARTICIPACAO'] as const
export const GatilhoCB = z.enum(GATILHOS_CB)

export const MaterialCB = z.object({
  titulo: z.string(),
  tipo: z.enum(['PDF', 'LINK']),
  url: z.string(),                       // link externo, ou URL assinada (10 min) do arquivo
  bytes: z.number().int().nullable(),
})

// ── Lista ────────────────────────────────────────────────────────────────────

export const EdicaoResumo = z.object({
  id: Uuid,
  nome: z.string().nullable(),
  situacao: SituacaoEdicaoCB,
  etapa: z.number().int().min(1).max(3), // onde parou (só vale para NAO_TERMINADA)
  inicio: DataCivil.nullable(),
  fim: DataCivil.nullable(),
  encontros: z.number().int(),           // não cancelados
  encontrosFeitos: z.number().int(),     // não cancelados com chamada registrada de algum grupo
  presencaMedia: z.number().int().nullable(), // % das linhas gravadas; null sem chamada
  proximoEncontro: z.object({ data: DataCivil, horario: Horario }).nullable(),
  atualizadaEm: InstanteIso,
})
export const EdicoesSaida = z.object({
  edicoes: z.array(EdicaoResumo),        // não terminadas, depois as outras por início ↓
  /** Sem unidade ativa a lista mostra o bloqueio "Antes, cadastre as unidades". */
  unidades: z.number().int(),
  /** Da configuração do clube: a etapa 1 de uma edição nova começa com eles. */
  padroes: z.object({ diaSemana: DiaSemana, local: z.string().nullable() }),
})

// ── Etapa 1: dados ───────────────────────────────────────────────────────────

/** Rascunho: tudo opcional, salvo a cada saída de campo. Em edição terminada, início, fim e dia são recusados. */
export const EdicaoRascunhoEntrada = z.object({
  nome: z.string().trim().max(120),
  inicio: DataCivil.nullable(),
  fim: DataCivil.nullable(),
  diaSemana: DiaSemana,
  horario: Horario.nullable(),
  local: Local,
  etapa: z.number().int().min(1).max(3),
}).partial()
export const EdicaoSaida = z.object({
  id: Uuid,
  nome: z.string().nullable(),
  inicio: DataCivil.nullable(),
  fim: DataCivil.nullable(),
  diaSemana: DiaSemana,
  horario: Horario.nullable(),
  local: z.string().nullable(),
  etapa: z.number().int().min(1).max(3),
  situacao: SituacaoEdicaoCB,
  terminadaEm: InstanteIso.nullable(),
  atualizadaEm: InstanteIso,             // "Salvo às HH:MM"
})

// ── Etapa 2: grupos ──────────────────────────────────────────────────────────

export const GruposEntrada = z.object({
  grupos: z.array(z.object({
    id: Uuid.optional(),                 // ausente = grupo novo
    nome: z.string().trim().max(120),    // pode ir vazio no rascunho; terminar exige
    unidadeIds: z.array(Uuid).max(100),
  })).max(30),
})
export const GrupoCB = z.object({
  id: Uuid,
  nome: z.string(),
  ordem: z.number().int(),
  unidadeIds: z.array(Uuid),
  material: MaterialCB.nullable(),
  /** Grupo com chamada registrada não sai da edição (regra 14). */
  temChamada: z.boolean(),
})
export const UnidadeParaGrupo = z.object({
  id: Uuid,
  nome: z.string(),
  dbvs: z.number().int(),                // desbravadores ativos hoje
  /** GRUPO: em outro grupo desta edição; EDICAO: numa edição terminada com período cruzado. */
  ocupadaPor: z.object({
    tipo: z.enum(['GRUPO', 'EDICAO']),
    nome: z.string(),
    inicio: DataCivil.optional(),
    fim: DataCivil.optional(),
  }).nullable(),
})
export const GruposSaida = z.object({
  grupos: z.array(GrupoCB),              // por ordem
  unidades: z.array(UnidadeParaGrupo),   // ativas, por nome
  atualizadaEm: InstanteIso,
})

// ── Etapa 3: datas e terminar ────────────────────────────────────────────────

export const DatasSaida = z.object({
  datas: z.array(z.object({
    data: DataCivil,
    marcada: z.boolean(),
    motivo: z.string().nullable(),       // "<rótulo do tipo>: <nome do evento>"
  })),
})
export const TerminarEntrada = z.object({ datas: z.array(DataCivil).min(1, 'Marque ao menos uma data').max(400) })

// ── Painel ───────────────────────────────────────────────────────────────────

export const EncontroDoPainel = z.object({
  id: Uuid,
  data: DataCivil,
  horario: Horario,
  local: z.string().nullable(),
  dataOriginal: DataCivil.nullable(),    // preenchida quando remarcado
  cancelado: z.boolean(),
  motivo: z.string().nullable(),
  /** Chamada de qualquer grupo: o encontro não remarca nem cancela. */
  temChamada: z.boolean(),
  /** Unidades do grupo naquele dia (composição da data); para quem só tem a chamada, as do escopo. */
  unidades: z.array(z.string()),
  /** Do grupo do painel; null sem chamada registrada dele. */
  chamada: z.object({
    presentes: z.number().int(), total: z.number().int(), participaram: z.number().int(),
  }).nullable(),
})
export const PainelSaida = z.object({
  edicao: EdicaoSaida,
  grupos: z.array(z.object({
    id: Uuid,
    nome: z.string(),
    unidades: z.array(z.object({ id: Uuid, nome: z.string(), dbvs: z.number().int() })),
    material: MaterialCB.nullable(),
    proximoEncontro: EncontroDoPainel.nullable(),
    frequenciaMedia: z.number().int().nullable(), // % de presença nas linhas gravadas
    encontrosFeitos: z.number().int(),
    encontrosPorVir: z.number().int(),
    abaixoDaMetade: z.number().int(),     // desbravadores com presença < 50% dos encontros em que têm linha
    encontros: z.array(EncontroDoPainel), // data ↓: feitos, cancelados e remarcados (sem os futuros sem chamada)
    /** Trocas de unidade depois do início da edição, data ↓; a tela as intercala entre os encontros (D31). */
    mudancas: z.array(z.object({
      data: DataCivil,
      unidade: z.string(),
      tipo: z.enum(['ENTROU', 'SAIU']),
      outroGrupo: z.string().nullable(),  // de onde veio ou para onde foi; null se saiu da edição
    })),
  })),                                    // para quem só tem a chamada: só os grupos do escopo
  podeGerenciar: z.boolean(),
  podeFazerChamada: z.boolean(),
})

export const FrequenciaGrupoSaida = z.object({
  grupo: z.object({ id: Uuid, nome: z.string() }),
  itens: z.array(z.object({
    dbvId: Uuid,
    nome: z.string(),
    unidade: z.string(),
    encontros: z.number().int(),          // Y: só as linhas gravadas (regra 13)
    presencas: z.number().int(),
    participacoes: z.number().int(),
  })),                                    // presença ↑, nome ↑; cortada pelo escopo
})

// ── Material ─────────────────────────────────────────────────────────────────

export const MaterialCBLinkEntrada = z.object({ titulo: TextoCurto, url: LinkHttps })
/** Campo `dados` do multipart de POST .../material/arquivo; o campo `arquivo` é o PDF (até 20 MB). */
export const MaterialCBArquivoDados = z.object({ titulo: TextoCurto })

// ── Encontros ────────────────────────────────────────────────────────────────

export const RemarcarEntrada = z.object({ data: DataCivil, horario: Horario.optional() })
export const CancelarEntrada = z.object({ motivo: TextoCurto })
export const EncontroSaida = z.object({
  id: Uuid,
  edicaoId: Uuid,
  data: DataCivil,
  horario: Horario,
  local: z.string().nullable(),
  dataOriginal: DataCivil.nullable(),
  cancelado: z.boolean(),
  motivo: z.string().nullable(),
  temChamada: z.boolean(),
  /** Desfazer o cancelamento vale até a data e se nenhum outro encontro não cancelado ocupa a data. */
  podeDesfazer: z.boolean(),
})
/** GET /classe-biblica/encontros/:id — o que a tela de remarcar precisa para avisar antes de enviar. */
export const EncontroDetalheSaida = z.object({
  encontro: EncontroSaida,
  edicao: z.object({ id: Uuid, nome: z.string(), inicio: DataCivil, fim: DataCivil }),
  grupos: z.array(z.string()),
  /** Datas de outros encontros não cancelados da edição: remarcar para elas é recusado. */
  ocupadas: z.array(DataCivil),
  /** Datas do período em Férias, Feriado ou Sem reunião: remarcar avisa e deixa seguir. */
  avisos: z.array(z.object({ data: DataCivil, motivo: z.string() })),
})

// ── Chamada ──────────────────────────────────────────────────────────────────

export const ChamadaCBSaida = z.object({
  encontro: z.object({
    id: Uuid, edicaoId: Uuid, edicaoNome: z.string(), data: DataCivil, horario: Horario,
    local: z.string().nullable(), dataOriginal: DataCivil.nullable(),
  }),
  grupo: z.object({ id: Uuid, nome: z.string() }),
  unidades: z.array(z.object({            // a unidade de cada um na data, por nome
    id: Uuid,
    nome: z.string(),
    desbravadores: z.array(z.object({
      dbvId: Uuid,
      nome: z.string(),
      entrouEm: DataCivil.nullable(),     // entrou na unidade depois do início da edição
      presente: z.boolean(),
      participou: z.boolean(),
      versao: InstanteIso.nullable(),     // null = ainda sem linha gravada
    })),
  })),
  registrada: z.boolean(),
})
export const ChamadaCBEnvio = z.object({
  envioId: Uuid,
  linhas: z.array(z.object({
    dbvId: Uuid,
    presente: z.boolean(),
    participou: z.boolean(),              // a API grava false para ausente
    versaoVista: InstanteIso.nullable(),
  })).max(500),
})
export const ChamadaCBEnvioSaida = z.object({
  linhas: z.array(z.object({ dbvId: Uuid, presente: z.boolean(), participou: z.boolean(), versao: InstanteIso })),
  /** Outra pessoa mudou a linha depois da versão vista: a que chegou por último (esta) valeu. */
  conflitos: z.array(z.object({ dbvId: Uuid, nome: z.string() })),
  /** Linhas descartadas: fora da lista da data ou do escopo de quem enviou. */
  ignorados: z.array(z.object({ dbvId: Uuid, nome: z.string() })),
  presentes: z.number().int(),
  participaram: z.number().int(),
})
// PUT /sync/classe-biblica/encontros/:id/grupos/:grupoId → ChamadaCBEnvioSaida

// ── Pontos ───────────────────────────────────────────────────────────────────

export const PontosCBSaida = z.object({
  itens: z.array(z.object({ gatilho: GatilhoCB, nome: z.string(), pontos: z.number().int(), ativo: z.boolean() })),
})
export const PontosCBEntrada = z.object({
  itens: z.array(z.object({ gatilho: GatilhoCB, pontos: z.number().int().min(0).max(1000), ativo: z.boolean() }))
    .min(1).max(2),
})

// ── Pacote de sync ───────────────────────────────────────────────────────────

/** Só para quem tem classebiblica.chamada: encontros de hoje−7 a hoje+7, cortados pelo escopo (regra 9). */
export const PacoteClasseBiblica = z.object({
  encontros: z.array(z.object({
    id: Uuid, edicaoId: Uuid, edicaoNome: z.string(), data: DataCivil, horario: Horario,
    local: z.string().nullable(), dataOriginal: DataCivil.nullable(),
  })),
  grupos: z.array(z.object({
    id: Uuid,
    encontroIds: z.array(Uuid),
    nome: z.string(),
    unidades: z.array(z.object({
      id: Uuid,
      nome: z.string(),
      membros: z.array(z.object({ dbvId: Uuid, nome: z.string(), inicio: DataCivil, fim: DataCivil.nullable() })),
    })),
  })),
  presencas: z.array(z.object({
    encontroId: Uuid, dbvId: Uuid, presente: z.boolean(), participou: z.boolean(), versao: InstanteIso,
  })),
  chamadasRegistradas: z.array(z.object({ encontroId: Uuid, grupoId: Uuid })),
})

// ── Ficha do desbravador ─────────────────────────────────────────────────────

const ContagemCB = z.object({
  edicao: z.string(),
  encontros: z.number().int(),            // Y
  presencas: z.number().int(),            // X
  participacoes: z.number().int(),        // N
})
/** Requisito com a marca `classeBiblica`; só edições que cruzam o ano do clube da matrícula (regra 13). */
export const ClasseBiblicaDoRequisito = ContagemCB.extend({
  grupo: z.string().nullable(),           // o da linha mais recente
  /** A unidade atual não está em grupo de edição em andamento: "a unidade dele(a) não está em nenhum grupo". */
  semGrupo: z.boolean(),
  anteriores: z.array(ContagemCB),        // "Antes: …", da mais recente para a mais antiga
})
