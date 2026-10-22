import { z } from 'zod'
import { SITUACOES_DO_EMPRESTIMO } from '../datas'
import { DataCivil, Uuid } from './comum'

export const LIMITE_BYTES_PDF_BIBLIOTECA = 50 * 1024 * 1024
export const LIMITE_BYTES_CAPA_BIBLIOTECA = 5 * 1024 * 1024
export const COTA_DA_BIBLIOTECA_BYTES = 2 * 1024 * 1024 * 1024

/** Controle, direção de texto e largura zero: o nome do item vira nome de arquivo baixado e esses caracteres disfarçam a extensão. */
// eslint-disable-next-line no-control-regex
const INVISIVEIS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g
const limpar = (texto: string) => texto.replace(INVISIVEIS, '').trim()

export const NomeDoItem = z.string().transform(limpar).pipe(z.string().min(1, 'Dê um nome ao item').max(120))
export const DescricaoDoItem = z
  .string()
  .transform(limpar)
  .pipe(z.string().max(120))
  .nullable()
  .transform((texto) => (texto ? texto : null))
export const NomeDaCategoria = z.string().transform(limpar).pipe(z.string().min(1, 'Dê um nome à categoria').max(60))

/** Campo `dados` do multipart de POST /biblioteca/itens; o campo `arquivo` é o PDF. */
export const ItemBibliotecaDados = z.object({ nome: NomeDoItem, descricao: DescricaoDoItem.default(null), categoriaId: Uuid })
export type ItemBibliotecaDados = z.input<typeof ItemBibliotecaDados>
export const ItemBibliotecaEditar = z.object({ nome: NomeDoItem, descricao: DescricaoDoItem, categoriaId: Uuid }).partial()
export type ItemBibliotecaEditar = z.input<typeof ItemBibliotecaEditar>
export const CategoriaBibliotecaEntrada = z.object({ nome: NomeDaCategoria })
export type CategoriaBibliotecaEntrada = z.input<typeof CategoriaBibliotecaEntrada>
export const MoverNaBiblioteca = z.object({ direcao: z.enum(['acima', 'abaixo']) })
export type MoverNaBiblioteca = z.infer<typeof MoverNaBiblioteca>

const ItemBibliotecaBase = z.object({
  id: Uuid,
  categoriaId: Uuid,
  nome: z.string(),
  descricao: z.string().nullable(),
  /** URL assinada da miniatura da capa. */
  capaUrl: z.string().nullable(),
})
export const ItemDigitalSaida = ItemBibliotecaBase.extend({
  tipo: z.literal('DIGITAL'),
  bytes: z.number().int(),
  /** URL assinada (10 min), variante `original`: abre no navegador. */
  urlLer: z.string(),
  /** URL assinada (10 min), variante `baixar`: sempre attachment. */
  urlBaixar: z.string(),
})
export type ItemDigitalSaida = z.infer<typeof ItemDigitalSaida>
/** `total` conta os exemplares não baixados; `disponiveis` os que não estão emprestados. */
export const ItemFisicoSaida = ItemBibliotecaBase.extend({
  tipo: z.literal('FISICO'),
  total: z.number().int().min(0),
  disponiveis: z.number().int().min(0),
})
export type ItemFisicoSaida = z.infer<typeof ItemFisicoSaida>
export const ItemBibliotecaSaida = z.discriminatedUnion('tipo', [ItemDigitalSaida, ItemFisicoSaida])
export type ItemBibliotecaSaida = z.infer<typeof ItemBibliotecaSaida>
export const CategoriaBibliotecaSaida = z.object({ id: Uuid, nome: z.string(), itens: z.array(ItemBibliotecaSaida) })
export type CategoriaBibliotecaSaida = z.infer<typeof CategoriaBibliotecaSaida>
/**
 * GET /biblioteca: categorias ativas por ordem, itens ativos por ordem.
 * POST /biblioteca/categorias e PATCH /biblioteca/categorias/:id → CategoriaBibliotecaSaida;
 * POST /biblioteca/categorias/:id/mover e DELETE /biblioteca/categorias/:id → 204.
 * POST /biblioteca/itens (multipart: dados, arquivo), PATCH /biblioteca/itens/:id,
 * PUT e DELETE /biblioteca/itens/:id/capa (multipart: capa) → ItemBibliotecaSaida;
 * POST /biblioteca/itens/:id/mover e DELETE /biblioteca/itens/:id → 204.
 */
export const BibliotecaSaida = z.object({ categorias: z.array(CategoriaBibliotecaSaida) })
export type BibliotecaSaida = z.infer<typeof BibliotecaSaida>

/** Quantidade de exemplares ao cadastrar ou acrescentar: de 1 a 50. */
const QuantidadeDeExemplares = z.number().int().min(1, 'Informe ao menos 1 exemplar').max(50, 'No máximo 50 exemplares por vez')

/** POST /biblioteca/itens-fisicos → ItemFisicoSaida. */
export const LivroFisicoEntrada = z.object({
  nome: NomeDoItem,
  descricao: DescricaoDoItem.default(null),
  categoriaId: Uuid,
  quantidade: QuantidadeDeExemplares,
})
export type LivroFisicoEntrada = z.input<typeof LivroFisicoEntrada>
/** POST /biblioteca/itens/:id/exemplares → ItemFisicoSaida (o item com os totais novos). */
export const AcrescentarExemplares = z.object({ quantidade: QuantidadeDeExemplares })
export type AcrescentarExemplares = z.input<typeof AcrescentarExemplares>

/**
 * POST /biblioteca/emprestimos → EmprestimoSaida. Estrito: não existe campo de devolução (o servidor grava
 * `devolverAte` com o prazo fixo), então `devolverAte`, `devolvidoEm` e qualquer outro campo são recusados.
 */
export const EmprestimoEntrada = z.strictObject({
  exemplarId: Uuid,
  desbravadorId: Uuid,
  /** Padrão hoje; até 60 dias antes, nunca futura. */
  emprestadoEm: DataCivil.optional(),
})
export type EmprestimoEntrada = z.input<typeof EmprestimoEntrada>

const SituacaoComDias = {
  situacao: z.enum(SITUACOES_DO_EMPRESTIMO),
  /** Dias de atraso; 0 fora do atraso. */
  dias: z.number().int().min(0),
}

/** POST /biblioteca/emprestimos e POST /biblioteca/emprestimos/:id/devolucao. */
export const EmprestimoSaida = z.object({
  id: Uuid,
  exemplarId: Uuid,
  desbravadorId: Uuid,
  emprestadoEm: DataCivil,
  devolverAte: DataCivil,
  devolvidoEm: DataCivil.nullable(),
})
export type EmprestimoSaida = z.infer<typeof EmprestimoSaida>

/** GET /biblioteca/desbravadores?busca= (mínimo 2 letras, até 20 resultados). */
export const BuscaDeDesbravadorParaEmprestimo = z.object({ busca: z.string().trim().min(2).max(120) })
export type BuscaDeDesbravadorParaEmprestimo = z.infer<typeof BuscaDeDesbravadorParaEmprestimo>
export const DesbravadorParaEmprestimoSaida = z.object({
  id: Uuid,
  nome: z.string(),
  /** Unidade atual; nulo = sem unidade. */
  unidade: z.string().nullable(),
  entradaEm: DataCivil,
  /** Livro que ele já tem em aberto (um por vez); nulo quando está livre. */
  livroEmAberto: z.object({ emprestimoId: Uuid, titulo: z.string() }).nullable(),
})
export type DesbravadorParaEmprestimoSaida = z.infer<typeof DesbravadorParaEmprestimoSaida>

export const SITUACAO_DO_EXEMPLAR = ['DISPONIVEL', 'EMPRESTADO', 'BAIXADO'] as const
export const ExemplarSaida = z.object({
  id: Uuid,
  numero: z.number().int().min(1),
  situacao: z.enum(SITUACAO_DO_EXEMPLAR),
  /** Empréstimo em aberto; nulo quando disponível ou baixado. */
  emprestimo: z
    .object({
      id: Uuid,
      desbravadorId: Uuid,
      desbravadorNome: z.string(),
      desbravadorAtivo: z.boolean(),
      unidade: z.string().nullable(),
      emprestadoEm: DataCivil,
      devolverAte: DataCivil,
      ...SituacaoComDias,
    })
    .nullable(),
})
export type ExemplarSaida = z.infer<typeof ExemplarSaida>
/**
 * GET /biblioteca/itens/:id/exemplares (exige `biblioteca.emprestar`): cabeçalho do livro, exemplares por
 * número e quem já devolveu (uma linha por desbravador, a devolução mais recente primeiro).
 */
export const LivroFisicoDetalheSaida = z.object({
  item: ItemFisicoSaida,
  exemplares: z.array(ExemplarSaida),
  jaDevolveram: z.array(
    z.object({ desbravadorId: Uuid, desbravadorNome: z.string(), unidade: z.string().nullable(), devolvidoEm: DataCivil }),
  ),
})
export type LivroFisicoDetalheSaida = z.infer<typeof LivroFisicoDetalheSaida>

/** Filtro `situacao` da aba Empréstimos: todas | atrasados | vencem-hoje | no-prazo. */
export const SituacaoDosEmprestimos = z.enum(['todas', 'atrasados', 'vencem-hoje', 'no-prazo'])
export type SituacaoDosEmprestimos = z.infer<typeof SituacaoDosEmprestimos>
/** GET /biblioteca/emprestimos?situacao=&busca= (busca no título e no nome do desbravador). */
export const EmprestimosFiltro = z.object({
  situacao: SituacaoDosEmprestimos.default('todas'),
  busca: z.string().trim().max(120).optional(),
})
export type EmprestimosFiltro = z.input<typeof EmprestimosFiltro>
/** Do mais atrasado ao mais no prazo; empate pela data de devolução. */
export const EmprestimosSaida = z.object({
  totais: z.object({ emprestados: z.number().int(), atrasados: z.number().int(), vencemHoje: z.number().int() }),
  itens: z.array(
    z.object({
      emprestimoId: Uuid,
      titulo: z.string(),
      numeroDoExemplar: z.number().int().min(1),
      desbravadorNome: z.string(),
      desbravadorAtivo: z.boolean(),
      unidade: z.string().nullable(),
      emprestadoEm: DataCivil,
      devolverAte: DataCivil,
      ...SituacaoComDias,
    }),
  ),
})
export type EmprestimosSaida = z.infer<typeof EmprestimosSaida>
