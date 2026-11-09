import { totalDoPedido } from '@desbravadores/shared'
import type { FormaPagamentoVendaSaida, PedidoListaSaida, PedidoSaida, ProdutoVendaSaida, VendaListaSaida, VendaPainelSaida, VendaResumoSaida, VendaSaida } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import { uuid } from './sessao'

export function criarProdutoDaVenda(n: number, parcial: Partial<ProdutoVendaSaida> = {}): ProdutoVendaSaida {
  return { id: uuid(9100 + n), nome: `Lasanha ${n}`, nomeCurto: `Lasanha ${n}`, preco: 2500, ordem: n - 1, ativo: true, ...parcial }
}

export const criarFormaPix = (parcial: Partial<Extract<FormaPagamentoVendaSaida, { tipo: 'PIX' }>> = {}): FormaPagamentoVendaSaida => ({
  id: uuid(9201), tipo: 'PIX', chave: '00.000.000/0001-00', favorecido: 'Clube Teste', ativo: true, ...parcial,
})

export const criarFormaSeteMe = (parcial: Partial<Extract<FormaPagamentoVendaSaida, { tipo: 'SETE_ME' }>> = {}): FormaPagamentoVendaSaida => ({
  id: uuid(9202), tipo: 'SETE_ME', orientacao: 'Ofertas > Outras ofertas > Desbravadores', ativo: true, ...parcial,
})

export const criarFormaDinheiro = (parcial: Partial<Extract<FormaPagamentoVendaSaida, { tipo: 'DINHEIRO' }>> = {}): FormaPagamentoVendaSaida => ({
  id: uuid(9203), tipo: 'DINHEIRO', ativo: true, ...parcial,
})

/** Venda aberta com dois produtos (R$ 25,00), taxa de R$ 5,00, Pix e Dinheiro, salvo o que `parcial` mudar. */
export function criarVenda(n: number, parcial: Partial<VendaSaida> = {}): VendaSaida {
  return {
    id: uuid(9000 + n), nome: `Lasanhas ${n}`, taxaEntrega: 500, retiradaData: '2026-11-14', retiradaHorario: '9h às 12h', retiradaLocal: 'Salão da igreja',
    instrucoes: 'Guarde na geladeira.', encerradaEm: null, criadoEm: '2026-10-20T12:00:00.000Z',
    produtos: [criarProdutoDaVenda(1, { nome: 'Lasanha de carne', nomeCurto: 'Carne' }), criarProdutoDaVenda(2, { nome: 'Lasanha de frango', nomeCurto: 'Frango' })],
    formas: [criarFormaPix(), criarFormaDinheiro()],
    ...parcial,
  }
}

/** Item da lista: 47 pedidos, 171 unidades, R$ 3.930 recebidos de R$ 4.305 vendidos, salvo o que `parcial` mudar. */
export function criarResumoDeVenda(n: number, parcial: Partial<VendaResumoSaida> = {}): VendaResumoSaida {
  const venda = criarVenda(n)
  return {
    id: venda.id, nome: venda.nome, taxaEntrega: venda.taxaEntrega, retiradaData: venda.retiradaData, retiradaHorario: venda.retiradaHorario,
    retiradaLocal: venda.retiradaLocal, instrucoes: venda.instrucoes, encerradaEm: venda.encerradaEm, criadoEm: venda.criadoEm,
    pedidos: 47, unidadesVendidas: 171, vendido: 430_500, recebido: 393_000,
    ...parcial,
  }
}

/** Painel com 3 pedidos a pagar e nenhuma linha por unidade, salvo o que `parcial` mudar. */
export function criarPainel(parcial: Partial<VendaPainelSaida> = {}): VendaPainelSaida {
  return {
    unidadesVendidas: 171, porProduto: [{ produtoId: uuid(9101), nome: 'Lasanha de carne', nomeCurto: 'Carne', unidades: 171 }],
    vendido: 430_500, recebido: 393_000, aReceber: 37_500, pedidosAPagar: 3, aEntregar: 31, entregues: 16, porUnidade: [],
    contadores: { todos: 47, aPagar: 3, aEntregar: 31, entregues: 16 },
    ...parcial,
  }
}

/** Pedido a pagar, retirada, 2 unidades do produto 1 (R$ 25,00 cada), salvo o que `parcial` mudar. `total` sai de `totalDoPedido`. */
export function criarPedido(n: number, parcial: Partial<PedidoSaida> = {}): PedidoSaida {
  const itens = parcial.itens ?? [{ produtoId: uuid(9101), nome: 'Lasanha de carne', nomeCurto: 'Carne', quantidade: 2, precoGravado: 2500 }]
  const taxaEntrega = parcial.taxaEntrega ?? 0
  return {
    id: uuid(9300 + n), codigo: `COD${String(n).padStart(3, '0')}`, comprador: `Comprador ${n}`, vendedor: null, unidadeId: null, unidadeNome: null, daDiretoria: false, entrega: false, endereco: null,
    taxaEntrega, observacao: null, pago: false, forma: null, entregueEm: null, canceladoEm: null, criadoEm: '2026-10-21T12:00:00.000Z',
    total: totalDoPedido(itens, taxaEntrega),
    ...parcial,
    itens,
  }
}

export function criarListaDePedidos(itens: PedidoSaida[], parcial: Partial<PedidoListaSaida> = {}): PedidoListaSaida {
  return { itens, total: itens.length, pagina: 1, porPagina: 20, ...parcial }
}

export interface RecusaDaApi {
  status: number
  codigo: 'CONFLITO' | 'NAO_ENCONTRADO' | 'VALIDACAO' | 'REGRA' | 'SEM_PERMISSAO' | 'ERRO_INTERNO'
  mensagem: string
}

const recusa = ({ status, codigo, mensagem }: RecusaDaApi) => HttpResponse.json({ codigo, mensagem }, { status })
const ehRecusa = (resposta: object): resposta is RecusaDaApi => 'status' in resposta && 'mensagem' in resposta

/** Devolve o que `resposta` guarda; é uma função para o teste trocar o conteúdo entre uma leitura e outra. */
const leitura = <T extends object>(caminho: string, resposta: () => T | RecusaDaApi) =>
  http.get(caminho, () => {
    const lida = resposta()
    return ehRecusa(lida) ? recusa(lida) : HttpResponse.json(lida)
  })

export const handlerListaDeVendas = (resposta: () => VendaListaSaida | RecusaDaApi) => leitura('/api/vendas', resposta)
export const handlerVenda = (resposta: () => VendaSaida | RecusaDaApi) => leitura('/api/vendas/:id', resposta)
export const handlerPainel = (resposta: () => VendaPainelSaida | RecusaDaApi) => leitura('/api/vendas/:id/painel', resposta)
export const handlerPedido = (resposta: () => PedidoSaida | RecusaDaApi) => leitura('/api/vendas/:id/pedidos/:pedidoId', resposta)

/** `consultas` recebe a query string de cada leitura, na ordem. */
export const handlerPedidos = (resposta: () => PedidoListaSaida | RecusaDaApi, consultas: URLSearchParams[] = []) =>
  http.get('/api/vendas/:id/pedidos', ({ request }) => {
    consultas.push(new URL(request.url).searchParams)
    const lida = resposta()
    return ehRecusa(lida) ? recusa(lida) : HttpResponse.json(lida)
  })

export interface ChamadaDeVenda {
  metodo: string
  caminho: string
  corpo: unknown
}

async function registrar(chamadas: ChamadaDeVenda[], request: Request): Promise<void> {
  const texto = await request.text()
  chamadas.push({ metodo: request.method, caminho: new URL(request.url).pathname, corpo: texto === '' ? null : (JSON.parse(texto) as unknown) })
}

export interface RespostasDeEscrita {
  /** O que criar, editar, encerrar e reabrir devolvem. */
  venda?: VendaSaida
  /** O que lançar, editar, pagar, entregar e cancelar devolvem. */
  pedido?: PedidoSaida
}

/** Toda escrita da venda: cada chamada vai para `chamadas`, na ordem, e a resposta é a de `respostas`. */
export const handlersEscritaVendas = (chamadas: ChamadaDeVenda[], respostas: RespostasDeEscrita = {}) => {
  const venda = () => respostas.venda ?? criarVenda(1)
  const pedido = () => respostas.pedido ?? criarPedido(1)
  const escrita = (metodo: 'post' | 'patch', caminho: string, corpo: () => object, status = 200) =>
    http[metodo](caminho, async ({ request }) => {
      await registrar(chamadas, request)
      return HttpResponse.json(corpo(), { status })
    })
  return [
    escrita('post', '/api/vendas', venda, 201),
    escrita('patch', '/api/vendas/:id', venda),
    escrita('post', '/api/vendas/:id/encerrar', venda, 201),
    escrita('post', '/api/vendas/:id/reabrir', venda, 201),
    escrita('post', '/api/vendas/:id/pedidos', pedido, 201),
    escrita('patch', '/api/vendas/:id/pedidos/:pedidoId', pedido),
    ...['pagar', 'despagar', 'entregar', 'desentregar', 'cancelar', 'reativar'].map((acao) => escrita('post', `/api/vendas/:id/pedidos/:pedidoId/${acao}`, pedido, 201)),
  ]
}

export interface DadosDeVendas extends RespostasDeEscrita {
  vendas?: VendaResumoSaida[]
  painel?: VendaPainelSaida
  pedidos?: PedidoSaida[]
  chamadas?: ChamadaDeVenda[]
}

/** Todas as rotas de vendas respondendo com dados de exemplo: o que o teste não passar vem do `criar…` correspondente. */
export const handlersVendas = ({ vendas = [criarResumoDeVenda(1)], painel = criarPainel(), pedidos = [criarPedido(1)], chamadas = [], venda = criarVenda(1), pedido = pedidos[0] ?? criarPedido(1) }: DadosDeVendas = {}) => [
  handlerListaDeVendas(() => ({ vendas })),
  handlerVenda(() => venda),
  handlerPainel(() => painel),
  handlerPedidos(() => criarListaDePedidos(pedidos)),
  handlerPedido(() => pedido),
  ...handlersEscritaVendas(chamadas, { venda, pedido }),
]
