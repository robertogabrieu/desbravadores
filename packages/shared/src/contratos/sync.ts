import { z } from 'zod'
import { Horario, Sexo, TipoPessoa } from '../enums'
import { DataCivil, InstanteIso, Uuid } from './comum'
import { RefClasse } from './auth'
import { MarcacaoChamadaServidor } from './reunioes'
import { RequisitoResumo } from './cronograma'
import { ItemTarefa } from './aulas'
import { EventoSaida } from './calendario'
import { PacoteClasseBiblica } from './classe-biblica'

export const MembroPacote = z.object({
  dbvId: Uuid,
  nome: z.string(),
  nomePublico: z.string(),
  sexo: Sexo,
  idade: z.number().int(),
  classeAtual: RefClasse.nullable(),
  autorizacaoImagem: z.boolean(),
})
export const PacoteInstrutor = z.object({
  classes: z.array(z.object({
    classe: RefClasse,
    membros: z.array(MembroPacote.extend({                 // matrícula CURSANDO no ano
      tipo: TipoPessoa,
      /** Ficha ligada à conta de quem baixou: aparece como "você", sem marcação de requisito. */
      voce: z.boolean().default(false),
      concluidos: z.array(Uuid),
      /** Data e aula de cada conclusão ativa: o registro offline mostra a data e desmarca a desta aula. */
      conclusoes: z.array(z.object({
        requisitoId: Uuid, concluidoEm: DataCivil, registroAulaId: Uuid.nullable(),
      })).default([]),
      /** Conclusões ativas das especialidades que estão nas tarefas da classe. */
      especialidades: z.array(z.object({ especialidadeId: Uuid, registroAulaId: Uuid.nullable() })).default([]),
    })),
    requisitos: z.array(RequisitoResumo),                  // ativos, com ajuste do clube
    aulasProximas: z.array(z.object({                      // publicadas, próximos 14 dias
      aulaPlanejadaId: Uuid, data: DataCivil, horario: Horario.nullable(), titulo: z.string().nullable(), requisitoIds: z.array(Uuid),
    })),
    registrosRecentes: z.array(z.object({                  // últimos 30 dias
      id: Uuid, data: DataCivil, aulaPlanejadaId: Uuid.nullable(),
      presencas: z.array(z.object({ dbvId: Uuid, presente: z.boolean(), versao: InstanteIso })),
    })),
    /** Tarefas para casa: abertas do ano do clube e encerradas com entrega num registro recente (para corrigir sem rede). */
    tarefas: z.array(z.object({
      id: Uuid, registroAulaId: Uuid, data: DataCivil, encerrada: z.boolean(), itens: z.array(ItemTarefa),
    })).default([]),
  })),
  /** Catálogo ativo (oficial e do clube). Ausente = pacote de antes desta mudança: a tela pede internet. */
  especialidades: z.array(z.object({ id: Uuid, nome: z.string(), area: z.string() })).optional(),
  pontosRequisito: z.object({ pontos: z.number().int(), ativo: z.boolean() }),
  pontosEspecialidade: z.object({ pontos: z.number().int(), ativo: z.boolean() }).default({ pontos: 0, ativo: false }),
})

/** Evento do calendário no pacote offline: o que a regra do dia precisa, sem o id. */
export const EventoDoPacote = EventoSaida.omit({ id: true })

export const PacoteSaida = z.object({
  /** SHA-256 do JSON canônico do conteúdo (sem geradoEm; unidades e membros por nome, reuniões por data). */
  versao: z.string(),
  geradoEm: InstanteIso,
  usuarioId: Uuid,
  vinculoId: Uuid,
  clube: z.object({
    id: Uuid, nome: z.string(), fuso: z.string(),
    diaReuniao: z.number().int().min(0).max(6), horaReuniao: Horario, localReuniaoPadrao: z.string().nullable(),
    descontarFalta: z.boolean(), pontosDescontoFalta: z.number().int(),
  }),
  /** Os 5 critérios padrão de chamada (um por gatilho), ativos e inativos. */
  criterios: z.array(z.object({
    gatilho: z.enum(['PRESENCA', 'PONTUALIDADE', 'UNIFORME', 'BIBLIA', 'LICAO']),
    nome: z.string(), pontos: z.number().int(), ativo: z.boolean(),
  })),
  unidades: z.array(z.object({ id: Uuid, nome: z.string(), membros: z.array(MembroPacote) })),
  /** Reuniões dos últimos 30 dias das unidades do usuário, com a chamada e as versões. */
  reunioesRecentes: z.array(z.object({
    id: Uuid, unidadeId: Uuid, data: DataCivil, horario: Horario,
    local: z.string().nullable(), observacoes: z.string().nullable(), cabecalhoVersao: InstanteIso,
    chamada: z.array(MarcacaoChamadaServidor),
  })),
  /** Álbuns dos últimos 60 dias (com ou sem foto). */
  albunsRecentes: z.array(z.object({
    id: Uuid, unidadeId: Uuid, titulo: z.string(), data: DataCivil, reuniaoId: Uuid.nullable(),
  })),
  /** Eventos não removidos com inicio <= hoje+120 e fim >= hoje. O default mantém válidos pacotes guardados antes. */
  calendario: z.array(EventoDoPacote).default([]),
  /** Preenchido só para INSTRUTOR. O default mantém válidos pacotes e mocks que ainda não têm o campo. */
  instrutor: PacoteInstrutor.nullable().default(null),
  /** Só para quem tem classebiblica.chamada. Ausente = pacote de antes desta mudança: sem Classe Bíblica. */
  classeBiblica: PacoteClasseBiblica.nullable().optional(),
})
// GET /api/sync/pacote → PacoteSaida (CONSELHEIRO; ADM e INSTRUTOR recebem unidades: [] nesta fase)
