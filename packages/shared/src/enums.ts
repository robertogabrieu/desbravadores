import { z } from 'zod'

export const PAPEIS = ['ADM', 'CONSELHEIRO', 'INSTRUTOR'] as const
export const STATUS_USUARIO = ['CONVIDADO', 'ATIVO', 'INATIVO'] as const
export const SEXOS = ['F', 'M'] as const
export const TIPOS_PESSOA = ['DBV', 'DIRETORIA', 'LIDER'] as const
export const TIPOS_UNIDADE = ['MISTA', 'MASCULINA', 'FEMININA'] as const
export const TIPOS_CLASSE = ['REGULAR', 'AVANCADA'] as const
export const TRILHAS = ['INDIVIDUAL', 'AGRUPADAS'] as const
export const ORIGENS = ['OFICIAL', 'CLUBE'] as const
export const QUEM_MONTA = ['ADM', 'INSTRUTOR'] as const
export const STATUS_MATRICULA = ['CURSANDO', 'CONCLUIDA', 'INVESTIDA', 'DESISTIU'] as const

export const Papel = z.enum(PAPEIS)
export const Sexo = z.enum(SEXOS)
export const TipoPessoa = z.enum(TIPOS_PESSOA)
export const TipoUnidade = z.enum(TIPOS_UNIDADE)
export const TipoClasse = z.enum(TIPOS_CLASSE)
export const Trilha = z.enum(TRILHAS)
export const Origem = z.enum(ORIGENS)
export const QuemMonta = z.enum(QUEM_MONTA)
export const StatusMatricula = z.enum(STATUS_MATRICULA)
export const StatusUsuario = z.enum(STATUS_USUARIO)
export type Papel = z.infer<typeof Papel>

// Fase 1
export const SITUACOES_CHAMADA = ['PRESENTE', 'ATRASADO', 'FALTA', 'FALTA_JUSTIFICADA'] as const
export const SituacaoChamadaZ = z.enum(SITUACOES_CHAMADA) // formulas/situacao.ts passa a derivar o tipo daqui
export const ORIGENS_ALTERACAO = ['EDICAO', 'CONFLITO_SYNC'] as const

/** "AAAA-MM" */
export const MesCivil = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido')
/** "HH:MM" 24 h */
export const Horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido')

// Fases 2 e 3
export const TIPOS_EVENTO = ['SEM_REUNIAO', 'ACAMPAMENTO', 'EVENTO', 'FERIADO', 'FERIAS', 'REUNIAO_EXTRA'] as const
export const TipoEvento = z.enum(TIPOS_EVENTO)
export const STATUS_CRONOGRAMA = ['RASCUNHO', 'ENVIADO', 'PUBLICADO'] as const
export const StatusCronograma = z.enum(STATUS_CRONOGRAMA)
export const ALVOS_OBSERVACAO = ['AULA', 'DBV'] as const
export const AlvoObservacao = z.enum(ALVOS_OBSERVACAO)
export const TIPOS_MATERIAL = ['PDF', 'APRESENTACAO', 'DOCUMENTO', 'LINK'] as const
/** Extensão → mime → tipo. O mime gravado vem SEMPRE desta tabela (nunca do cliente/multer). */
export const FORMATOS_MATERIAL = {
  pdf: { mime: 'application/pdf', tipo: 'PDF' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', tipo: 'APRESENTACAO' },
  odp: { mime: 'application/vnd.oasis.opendocument.presentation', tipo: 'APRESENTACAO' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', tipo: 'DOCUMENTO' },
  odt: { mime: 'application/vnd.oasis.opendocument.text', tipo: 'DOCUMENTO' },
} as const
export const TipoMaterial = z.enum(TIPOS_MATERIAL)
export const TIPOS_NOTIFICACAO = ['CONFLITO_CRONOGRAMA', 'CRONOGRAMA_ENVIADO', 'CRONOGRAMA_PUBLICADO', 'PEDIDO_LIBERAR_CRONOGRAMA'] as const
export const TipoNotificacao = z.enum(TIPOS_NOTIFICACAO)

/** Padrão das marcações por tipo. Férias: a API grava sempre este; Reunião extra: campo é sempre não. */
export const MARCACOES_PADRAO = {
  SEM_REUNIAO: { temReuniao: false, temClasse: false, bomParaCampo: false },
  EVENTO: { temReuniao: true, temClasse: false, bomParaCampo: false },
  ACAMPAMENTO: { temReuniao: false, temClasse: true, bomParaCampo: true },
  FERIADO: { temReuniao: true, temClasse: true, bomParaCampo: false },
  FERIAS: { temReuniao: false, temClasse: true, bomParaCampo: false },
  REUNIAO_EXTRA: { temReuniao: true, temClasse: true, bomParaCampo: false },
} as const
