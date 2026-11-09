import { z } from 'zod'
import {
  FILTROS_DO_PEDIDO,
  FORMAS_DO_PEDIDO,
  PRECO_MAXIMO_CENTAVOS,
  PRECO_MINIMO_CENTAVOS,
  QUANTIDADE_MAXIMA_POR_ITEM,
  TAXA_MAXIMA_CENTAVOS,
} from '../vendas'
import { DataCivil, InstanteIso, pagina, Uuid } from './comum'

const Centavos = z.number().int()
const Taxa = Centavos.min(0, 'A taxa não pode ser negativa').max(TAXA_MAXIMA_CENTAVOS, 'Taxa de entrega acima do limite')
const Preco = Centavos.min(PRECO_MINIMO_CENTAVOS, 'Informe um preço').max(PRECO_MAXIMO_CENTAVOS, 'Preço acima do limite')
const Quantidade = z.number().int('Use só números inteiros, como 2').min(0, 'A quantidade não pode ser negativa').max(QUANTIDADE_MAXIMA_POR_ITEM, 'Quantidade acima do limite')

const acimaDoLimite = (maximo: number): string => `Use no máximo ${maximo} caracteres`

const Obrigatorio = (maximo: number, mensagem: string) => z.string().trim().min(1, mensagem).max(maximo, acimaDoLimite(maximo))
/** Texto opcional: vazio vira nulo. */
const Opcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, acimaDoLimite(maximo))
    .nullish()
    .transform((texto) => (texto ? texto : null))

export const FormaDoPedidoContrato = z.enum(FORMAS_DO_PEDIDO)
export const FiltroDoPedidoContrato = z.enum(FILTROS_DO_PEDIDO)

// Forma de pagamento da venda: união discriminada por `tipo`.
const FormaBase = { id: Uuid }
const PixDados = { tipo: z.literal('PIX'), chave: Obrigatorio(140, 'Informe a chave Pix'), favorecido: Obrigatorio(120, 'Informe o favorecido') }
const SeteMeDados = { tipo: z.literal('SETE_ME'), orientacao: Obrigatorio(500, 'Oriente como pagar pelo 7me') }
const DinheiroDados = { tipo: z.literal('DINHEIRO') }

export const FormaPagamentoVendaEntrada = z.discriminatedUnion('tipo', [
  z.object({ id: Uuid.optional(), ...PixDados }),
  z.object({ id: Uuid.optional(), ...SeteMeDados }),
  z.object({ id: Uuid.optional(), ...DinheiroDados }),
])
export type FormaPagamentoVendaEntrada = z.input<typeof FormaPagamentoVendaEntrada>

export const FormaPagamentoVendaSaida = z.discriminatedUnion('tipo', [
  z.object({ ...FormaBase, ativo: z.boolean(), ...PixDados }),
  z.object({ ...FormaBase, ativo: z.boolean(), ...SeteMeDados }),
  z.object({ ...FormaBase, ativo: z.boolean(), ...DinheiroDados }),
])
export type FormaPagamentoVendaSaida = z.infer<typeof FormaPagamentoVendaSaida>

/** `id` ausente = produto novo; a ordem da lista é a ordem do produto. */
export const ProdutoVendaEntrada = z.object({
  id: Uuid.optional(),
  nome: Obrigatorio(120, 'Dê um nome ao produto'),
  nomeCurto: Obrigatorio(40, 'Dê um nome curto ao produto'),
  preco: Preco,
})
export type ProdutoVendaEntrada = z.input<typeof ProdutoVendaEntrada>

export const ProdutoVendaSaida = z.object({
  id: Uuid,
  nome: z.string(),
  nomeCurto: z.string(),
  preco: Centavos,
  ordem: z.number().int(),
  ativo: z.boolean(),
})
export type ProdutoVendaSaida = z.infer<typeof ProdutoVendaSaida>

/**
 * POST /vendas e PATCH /vendas/:id → VendaSaida. Na edição, produto ou forma ausente da lista é
 * desativado; sem `id` é novo. Ao menos um produto e uma forma.
 */
export const VendaEntrada = z
  .object({
    nome: Obrigatorio(120, 'Dê um nome à venda'),
    taxaEntrega: Taxa,
    retiradaData: DataCivil.nullish().transform((data) => data ?? null),
    retiradaHorario: Opcional(60),
    retiradaLocal: Opcional(200),
    instrucoes: Opcional(1000),
    produtos: z.array(ProdutoVendaEntrada).min(1, 'Cadastre ao menos um produto.'),
    formas: z.array(FormaPagamentoVendaEntrada).min(1, 'Escolha ao menos uma forma de pagamento.'),
  })
  .superRefine((venda, ctx) => {
    const tipos = venda.formas.map((forma) => forma.tipo)
    if (new Set(tipos).size !== tipos.length) {
      ctx.addIssue({ code: 'custom', path: ['formas'], message: 'Cada forma de pagamento aparece uma vez.' })
    }
  })
export type VendaEntrada = z.input<typeof VendaEntrada>

const VendaBase = {
  id: Uuid,
  nome: z.string(),
  taxaEntrega: Centavos,
  retiradaData: DataCivil.nullable(),
  retiradaHorario: z.string().nullable(),
  retiradaLocal: z.string().nullable(),
  instrucoes: z.string().nullable(),
  encerradaEm: InstanteIso.nullable(),
  criadoEm: InstanteIso,
}

/** GET /vendas/:id, POST /vendas, PATCH /vendas/:id, POST /vendas/:id/encerrar e /reabrir. */
export const VendaSaida = z.object({
  ...VendaBase,
  produtos: z.array(ProdutoVendaSaida),
  formas: z.array(FormaPagamentoVendaSaida),
})
export type VendaSaida = z.infer<typeof VendaSaida>

/** Item da lista: pedidos ativos, unidades e valores já calculados no servidor. */
export const VendaResumoSaida = z.object({
  ...VendaBase,
  pedidos: z.number().int().min(0),
  unidadesVendidas: z.number().int().min(0),
  vendido: Centavos,
  recebido: Centavos,
})
export type VendaResumoSaida = z.infer<typeof VendaResumoSaida>

/** GET /vendas: a aberta primeiro. */
export const VendaListaSaida = z.object({ vendas: z.array(VendaResumoSaida) })
export type VendaListaSaida = z.infer<typeof VendaListaSaida>

export const LinhaDeUnidadeNoPainel = z.object({
  tipo: z.enum(['UNIDADE', 'DIRETORIA', 'SEM_UNIDADE']),
  unidadeId: Uuid.nullable(),
  nome: z.string(),
  /** Falso para unidade desativada depois: a linha continua, marcada "(inativa)". */
  ativa: z.boolean(),
  unidades: z.number().int().min(0),
})
export type LinhaDeUnidadeNoPainel = z.infer<typeof LinhaDeUnidadeNoPainel>

/** Contadores dos filtros: contados no servidor; "todos" inclui cancelados. */
export const ContadoresDosFiltros = z.object({
  todos: z.number().int().min(0),
  aPagar: z.number().int().min(0),
  aEntregar: z.number().int().min(0),
  entregues: z.number().int().min(0),
})
export type ContadoresDosFiltros = z.infer<typeof ContadoresDosFiltros>

/** GET /vendas/:id/painel: os números do glossário da SPEC. Valores em centavos. */
export const VendaPainelSaida = z.object({
  unidadesVendidas: z.number().int().min(0),
  porProduto: z.array(z.object({ produtoId: Uuid, nome: z.string(), nomeCurto: z.string(), unidades: z.number().int().min(0) })),
  vendido: Centavos,
  recebido: Centavos,
  aReceber: Centavos,
  pedidosAPagar: z.number().int().min(0),
  aEntregar: z.number().int().min(0),
  entregues: z.number().int().min(0),
  porUnidade: z.array(LinhaDeUnidadeNoPainel),
  contadores: ContadoresDosFiltros,
})
export type VendaPainelSaida = z.infer<typeof VendaPainelSaida>

const ItemDoPedidoEntrada = z.object({ produtoId: Uuid, quantidade: Quantidade })

const DadosDoPedido = {
  comprador: Obrigatorio(120, 'Informe o nome de quem comprou'),
  vendedor: Opcional(120),
  unidadeId: Uuid.nullish().transform((id) => id ?? null),
  daDiretoria: z.boolean().default(false),
  entrega: z.boolean().default(false),
  endereco: Opcional(300),
  observacao: Opcional(500),
  itens: z.array(ItemDoPedidoEntrada),
}

interface DadosValidaveis {
  unidadeId: string | null
  daDiretoria: boolean
  entrega: boolean
  endereco: string | null
  itens: { produtoId: string; quantidade: number }[]
  pago?: boolean
  forma?: string | null
}

function validarPedido(pedido: DadosValidaveis, ctx: z.RefinementCtx): void {
  const recusar = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
  if (pedido.entrega && !pedido.endereco) recusar('endereco', 'Informe o endereço da entrega.')
  if (!pedido.entrega && pedido.endereco) recusar('endereco', 'Retirada não tem endereço.')
  if (pedido.daDiretoria && pedido.unidadeId) recusar('unidadeId', 'Escolha a unidade ou a Diretoria, não as duas.')
  if (!pedido.itens.some((item) => item.quantidade > 0)) recusar('itens', 'Escolha ao menos uma unidade.')
  const produtos = pedido.itens.map((item) => item.produtoId)
  if (new Set(produtos).size !== produtos.length) recusar('itens', 'Cada produto aparece uma vez.')
  if (pedido.forma && !pedido.pago) recusar('forma', 'A forma de pagamento só existe em pedido pago.')
}

/** POST /vendas/:id/pedidos → PedidoSaida. `forma` só com `pago`. */
export const PedidoEntrada = z
  .object({ ...DadosDoPedido, pago: z.boolean().default(false), forma: FormaDoPedidoContrato.nullish().transform((forma) => forma ?? null) })
  .superRefine(validarPedido)
export type PedidoEntrada = z.input<typeof PedidoEntrada>

/** PATCH /vendas/:id/pedidos/:pedidoId → PedidoSaida. Pagamento muda só por /pagar e /despagar. */
export const PedidoEdicao = z.object(DadosDoPedido).superRefine(validarPedido)
export type PedidoEdicao = z.input<typeof PedidoEdicao>

/** POST /vendas/:id/pedidos/:pedidoId/pagar → PedidoSaida. */
export const PagarPedidoEntrada = z.object({ forma: FormaDoPedidoContrato })
export type PagarPedidoEntrada = z.input<typeof PagarPedidoEntrada>

/** GET /vendas/:id/pedidos: mais novo primeiro, `PEDIDOS_POR_PAGINA` por página; busca por nome do comprador ou código. */
export const PedidosQuery = z.object({
  filtro: FiltroDoPedidoContrato.default('TODOS'),
  busca: z.string().trim().max(120).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
})
export type PedidosQuery = z.input<typeof PedidosQuery>

export const ItemDoPedidoSaida = z.object({
  produtoId: Uuid,
  nome: z.string(),
  nomeCurto: z.string(),
  quantidade: z.number().int().min(0),
  precoGravado: Centavos,
})
export type ItemDoPedidoSaida = z.infer<typeof ItemDoPedidoSaida>

/** `total` vem de `totalDoPedido`: a tela nunca recalcula. */
export const PedidoSaida = z.object({
  id: Uuid,
  codigo: z.string(),
  comprador: z.string(),
  vendedor: z.string().nullable(),
  unidadeId: Uuid.nullable(),
  unidadeNome: z.string().nullable(),
  daDiretoria: z.boolean(),
  entrega: z.boolean(),
  endereco: z.string().nullable(),
  taxaEntrega: Centavos,
  observacao: z.string().nullable(),
  pago: z.boolean(),
  forma: FormaDoPedidoContrato.nullable(),
  entregueEm: InstanteIso.nullable(),
  canceladoEm: InstanteIso.nullable(),
  criadoEm: InstanteIso,
  itens: z.array(ItemDoPedidoSaida),
  total: Centavos,
})
export type PedidoSaida = z.infer<typeof PedidoSaida>

export const PedidoListaSaida = pagina(PedidoSaida)
export type PedidoListaSaida = z.infer<typeof PedidoListaSaida>
