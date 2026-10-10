import { z } from 'zod'
import { Uuid } from './comum'

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

export const ItemBibliotecaSaida = z.object({
  id: Uuid,
  categoriaId: Uuid,
  nome: z.string(),
  descricao: z.string().nullable(),
  bytes: z.number().int(),
  /** URL assinada (10 min), variante `original`: abre no navegador. */
  urlLer: z.string(),
  /** URL assinada (10 min), variante `baixar`: sempre attachment. */
  urlBaixar: z.string(),
  /** URL assinada da miniatura da capa. */
  capaUrl: z.string().nullable(),
})
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
