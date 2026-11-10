import { Injectable } from '@nestjs/common'
import { totalDoPedido, type LinhaDeUnidadeNoPainel, type VendaPainelSaida } from '@desbravadores/shared'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { colador } from '../desbravadores/apoio'
import { VENDA_NAO_ENCONTRADA } from './constantes'

@Injectable()
export class PainelService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pedido cancelado fica fora de tudo, inclusive do contador "Todos"; só o contador "Cancelados" os conta. */
  async obter(clubeId: string, vendaId: string): Promise<VendaPainelSaida> {
    const venda = await this.prisma.vendaArrecadacao.findFirst({ where: { clubeId, id: vendaId }, select: { id: true } })
    if (!venda) throw new ErroApp('NAO_ENCONTRADO', VENDA_NAO_ENCONTRADA)

    const pedidos = await this.prisma.pedidoVenda.findMany({
      where: { clubeId, vendaId },
      select: { id: true, taxaEntrega: true, pago: true, entregueEm: true, canceladoEm: true, unidadeId: true, daDiretoria: true },
    })
    const ativos = pedidos.filter((pedido) => !pedido.canceladoEm)
    const itens = await this.prisma.itemPedidoVenda.findMany({
      where: { clubeId, pedidoId: { in: ativos.map((pedido) => pedido.id) } },
      select: { pedidoId: true, produtoId: true, quantidade: true, precoGravado: true },
    })
    const produtos = await this.prisma.produtoVenda.findMany({ where: { clubeId, vendaId }, orderBy: { ordem: 'asc' } })
    const unidades = await this.prisma.unidade.findMany({ where: { clubeId }, select: { id: true, nome: true, ativa: true } })

    const unidadesPorPedido = new Map<string, number>()
    const unidadesPorProduto = new Map<string, number>()
    for (const item of itens) {
      unidadesPorPedido.set(item.pedidoId, (unidadesPorPedido.get(item.pedidoId) ?? 0) + item.quantidade)
      unidadesPorProduto.set(item.produtoId, (unidadesPorProduto.get(item.produtoId) ?? 0) + item.quantidade)
    }
    const itensPorPedido = new Map<string, typeof itens>()
    for (const item of itens) itensPorPedido.set(item.pedidoId, [...(itensPorPedido.get(item.pedidoId) ?? []), item])

    let vendido = 0
    let recebido = 0
    for (const pedido of ativos) {
      const total = totalDoPedido(itensPorPedido.get(pedido.id) ?? [], pedido.taxaEntrega)
      vendido += total
      if (pedido.pago) recebido += total
    }
    const aPagar = ativos.filter((pedido) => !pedido.pago).length
    const entregues = ativos.filter((pedido) => pedido.entregueEm).length

    return {
      unidadesVendidas: itens.reduce((soma, item) => soma + item.quantidade, 0),
      porProduto: produtos
        .filter((produto) => produto.ativo || (unidadesPorProduto.get(produto.id) ?? 0) > 0)
        .map((produto) => ({
          produtoId: produto.id,
          nome: produto.nome,
          nomeCurto: produto.nomeCurto,
          unidades: unidadesPorProduto.get(produto.id) ?? 0,
        })),
      vendido,
      recebido,
      aReceber: vendido - recebido,
      pedidosAPagar: aPagar,
      aEntregar: ativos.length - entregues,
      entregues,
      porUnidade: linhasPorUnidade(ativos, unidades, unidadesPorPedido),
      contadores: { todos: ativos.length, aPagar, aEntregar: ativos.length - entregues, entregues, cancelados: pedidos.length - ativos.length },
    }
  }
}

interface PedidoDoPainel {
  id: string
  unidadeId: string | null
  daDiretoria: boolean
}

/** Unidade ativa sempre tem linha; a desativada só enquanto ainda tem unidades vendidas. Diretoria e Sem unidade sempre. */
function linhasPorUnidade(
  ativos: PedidoDoPainel[],
  unidades: { id: string; nome: string; ativa: boolean }[],
  unidadesPorPedido: Map<string, number>,
): LinhaDeUnidadeNoPainel[] {
  const porUnidade = new Map<string | null, number>()
  let diretoria = 0
  for (const pedido of ativos) {
    const quantidade = unidadesPorPedido.get(pedido.id) ?? 0
    if (pedido.daDiretoria) diretoria += quantidade
    else porUnidade.set(pedido.unidadeId, (porUnidade.get(pedido.unidadeId) ?? 0) + quantidade)
  }
  const linhas = unidades
    .map((unidade) => ({
      tipo: 'UNIDADE' as const,
      unidadeId: unidade.id,
      nome: unidade.nome,
      ativa: unidade.ativa,
      unidades: porUnidade.get(unidade.id) ?? 0,
    }))
    .filter((linha) => linha.ativa || linha.unidades > 0)
    .sort((a, b) => Number(b.ativa) - Number(a.ativa) || colador.compare(a.nome, b.nome))
  return [
    ...linhas,
    { tipo: 'DIRETORIA', unidadeId: null, nome: 'Diretoria', ativa: true, unidades: diretoria },
    { tipo: 'SEM_UNIDADE', unidadeId: null, nome: 'Sem unidade', ativa: true, unidades: porUnidade.get(null) ?? 0 },
  ]
}
