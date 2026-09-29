import { z } from 'zod'

export const PAPEIS = ['ADM', 'CONSELHEIRO', 'INSTRUTOR'] as const
export const STATUS_USUARIO = ['CONVIDADO', 'ATIVO', 'INATIVO'] as const
export const SEXOS = ['F', 'M'] as const
export const TIPOS_PESSOA = ['DBV', 'LIDER'] as const
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
