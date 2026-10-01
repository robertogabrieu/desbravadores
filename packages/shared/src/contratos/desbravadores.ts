import { z } from 'zod'
import { Sexo, StatusMatricula, TipoPessoa } from '../enums'
import { MOTIVOS_DIRETORIA } from '../formulas/diretoria'
import { DataCivil, Email, Paginacao, Uuid, pagina } from './comum'
import { RefClasse, RefUnidade } from './auth'

const camposPessoa = {
  nome: z.string().trim().min(2).max(120),
  nomePublico: z.string().trim().min(2).max(40), // vazio na criação → calculado por nomePublico()
  nascimento: DataCivil,
  sexo: Sexo,
  responsavelNome: z.string().trim().max(120).nullable(),
  responsavelTelefone: z.string().trim().max(30).nullable(),
  responsavelEmail: Email.nullable(),
  autorizacaoImagem: z.boolean(),
  autorizacaoImagemEm: DataCivil.nullable(),
}
export const DesbravadorCriarEntrada = z.object({
  ...camposPessoa,
  nomePublico: camposPessoa.nomePublico.optional(),
  tipo: TipoPessoa.default('DBV'),
  responsavelNome: camposPessoa.responsavelNome.optional(),
  responsavelTelefone: camposPessoa.responsavelTelefone.optional(),
  responsavelEmail: camposPessoa.responsavelEmail.optional(),
  autorizacaoImagem: z.boolean().default(false),
  autorizacaoImagemEm: camposPessoa.autorizacaoImagemEm.optional(),
  entradaEm: DataCivil,
  usuarioId: Uuid.nullable().optional(),  // conta de usuário do clube, em qualquer tipo; o tipo não muda
  unidadeId: Uuid.nullable().optional(),  // só tipo DBV; cria o MembroUnidade desde entradaEm
  classeId: Uuid.nullable().optional(),   // classe REGULAR do ano do clube; cria a matrícula
  incluirAvancada: z.boolean().default(true), // matricula também na avançada ligada
})
/** Adm edita tudo abaixo. Conselheiro (dbv.editar) só: nome, nomePublico, responsavel*,
 *  autorizacaoImagem, autorizacaoImagemEm — outro campo enviado por ele → 422 REGRA. */
export const DesbravadorEditarEntrada = z
  .object({ ...camposPessoa, tipo: TipoPessoa, usuarioId: Uuid.nullable() })
  .partial()
export const InativarEntrada = z.object({ saidaEm: DataCivil })
export const MoverUnidadeEntrada = z.object({ unidadeId: Uuid.nullable(), desde: DataCivil })
export const MatriculaEntrada = z.object({
  classeId: Uuid,
  anoClube: z.number().int().min(2000).max(2100),
  incluirAvancada: z.boolean().default(true),
})
export const MatriculaSaida = z.object({
  id: Uuid, classe: RefClasse, anoClube: z.number().int(), status: StatusMatricula,
})
export const ContatoResponsavel = z.object({
  responsavelNome: z.string().nullable(),
  responsavelTelefone: z.string().nullable(),
  responsavelEmail: z.string().nullable(),
})
/** Por que a pessoa é da Diretoria (o Tipo é gravado; o motivo é calculado a cada leitura). */
export const MotivoDiretoria = z.enum(MOTIVOS_DIRETORIA)
export const DesbravadorSaida = z.object({
  id: Uuid,
  nome: z.string(),
  nomePublico: z.string(),
  tipo: TipoPessoa,
  nascimento: DataCivil,
  idade: z.number().int(),
  sexo: Sexo,
  ativo: z.boolean(),
  entradaEm: DataCivil,
  saidaEm: DataCivil.nullable(),
  autorizacaoImagem: z.boolean(),
  autorizacaoImagemEm: DataCivil.nullable(),
  usuarioId: Uuid.nullable(),
  unidade: RefUnidade.nullable(),
  classeAtual: RefClasse.nullable(),   // matrícula CURSANDO na REGULAR do ano do clube
  avancadaAtual: RefClasse.nullable(), // matrícula CURSANDO na AVANCADA do ano do clube
  /** Vazio quando o Tipo não é DIRETORIA. */
  motivosDiretoria: z.array(MotivoDiretoria),
  /** Classes que a conta ligada instrui e unidades que aconselha, dos vínculos ativos do clube; sem conta, vazias. */
  instrui: z.array(RefClasse),
  aconselha: z.array(RefUnidade),
  /** Ausente (não null) quando quem pede não tem `dbv.ver_contato`. O serviço omite a chave. */
  contato: ContatoResponsavel.optional(),
})
export const DesbravadorFiltro = Paginacao.extend({
  busca: z.string().trim().max(60).optional(),     // nome, sem acento e sem caixa
  unidadeId: Uuid.optional(),
  semUnidade: z.stringbool().optional(),
  classeId: Uuid.optional(),
  tipo: TipoPessoa.optional(),
  ativo: z.enum(['true', 'false', 'todos']).default('true'),
})
export const DesbravadorLista = pagina(DesbravadorSaida) // ordem: nome ascendente

