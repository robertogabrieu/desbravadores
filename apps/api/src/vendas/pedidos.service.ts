import { Injectable } from '@nestjs/common'
import {
  PEDIDOS_POR_PAGINA,
  totalDoPedido,
  type FormaDoPedido,
  type PagarPedidoEntrada,
  type PedidoEdicao,
  type PedidoEntrada,
  type PedidoListaSaida,
  type PedidoSaida,
  type PedidosQuery,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { paginar, semAcento } from '../desbravadores/apoio'
import type { ItemPedidoVenda, PedidoVenda, Prisma, ProdutoVenda } from '../generated/prisma/client.js'
import { codigoLivreDoPedido } from './codigo-do-pedido'
import { exigirVendaAberta, VENDA_NAO_ENCONTRADA } from './constantes'
import { VendasService } from './vendas.service'

const PEDIDO_NAO_ENCONTRADO = 'Pedido não encontrado.'
const UNIDADE_NAO_ENCONTRADA = 'Unidade não encontrada.'
const PRODUTO_NAO_ENCONTRADO = 'Produto não encontrado nesta venda.'
const FORMA_RECUSADA = 'Esta venda não aceita essa forma de pagamento.'
const SEM_FORMA = 'Escolha a forma de pagamento.'
const PEDIDO_PAGO = 'Pedido já pago. Desmarque o pagamento para mudar o valor.'
const PEDIDO_ENTREGUE = 'Pedido já entregue. Desmarque a entrega antes de cancelar.'
const PEDIDO_CANCELADO = 'Pedido cancelado. Reative para alterar.'
const JA_CANCELADO = 'Este pedido já está cancelado.'

type Banco = Pick<PrismaService, 'pedidoVenda' | 'itemPedidoVenda' | 'produtoVenda' | 'unidade' | 'formaPagamentoVenda'>
type Entrada = z.output<typeof PedidoEntrada>
type Edicao = z.output<typeof PedidoEdicao>
type Consulta = z.output<typeof PedidosQuery>
type Pagamento = z.output<typeof PagarPedidoEntrada>
type ItemDaEntrada = Edicao['itens'][number]

/** Produtos da venda por id, com os desativados: o pedido antigo ainda os mostra. */
async function produtosDaVenda(banco: Banco, clubeId: string, vendaId: string): Promise<Map<string, ProdutoVenda>> {
  const produtos = await banco.produtoVenda.findMany({ where: { clubeId, vendaId } })
  return new Map(produtos.map((produto) => [produto.id, produto]))
}

async function exigirUnidadeAtiva(banco: Banco, clubeId: string, unidadeId: string): Promise<void> {
  const unidade = await banco.unidade.findFirst({ where: { clubeId, id: unidadeId, ativa: true }, select: { id: true } })
  if (!unidade) throw new ErroApp('NAO_ENCONTRADO', UNIDADE_NAO_ENCONTRADA)
}

/** Forma é uma das ativas da venda ou MISTO (combinação das aceitas, que só existe no pedido). */
async function exigirFormaAceita(banco: Banco, clubeId: string, vendaId: string, forma: FormaDoPedido | null): Promise<FormaDoPedido> {
  if (!forma) throw new ErroApp('REGRA', SEM_FORMA)
  if (forma === 'MISTO') return forma
  const aceita = await banco.formaPagamentoVenda.findFirst({ where: { clubeId, vendaId, tipo: forma, ativo: true }, select: { id: true } })
  if (!aceita) throw new ErroApp('REGRA', FORMA_RECUSADA)
  return forma
}

async function pedidoDaVenda(banco: Banco, clubeId: string, vendaId: string, id: string): Promise<PedidoVenda> {
  const pedido = await banco.pedidoVenda.findFirst({ where: { clubeId, vendaId, id } })
  if (!pedido) throw new ErroApp('NAO_ENCONTRADO', PEDIDO_NAO_ENCONTRADO)
  return pedido
}

function exigirNaoCancelado(pedido: PedidoVenda): void {
  if (pedido.canceladoEm) throw new ErroApp('CONFLITO', PEDIDO_CANCELADO)
}

/** Monta a saída de vários pedidos com consultas diretas (cada uma com `clubeId`), sem `include`. */
async function saidasDosPedidos(banco: Banco, clubeId: string, vendaId: string, pedidos: PedidoVenda[]): Promise<PedidoSaida[]> {
  if (pedidos.length === 0) return []
  const itens = await banco.itemPedidoVenda.findMany({ where: { clubeId, pedidoId: { in: pedidos.map((pedido) => pedido.id) } } })
  const produtos = await produtosDaVenda(banco, clubeId, vendaId)
  const idsDasUnidades = [...new Set(pedidos.flatMap((pedido) => (pedido.unidadeId ? [pedido.unidadeId] : [])))]
  const unidades = await banco.unidade.findMany({ where: { clubeId, id: { in: idsDasUnidades } }, select: { id: true, nome: true } })
  const nomeDaUnidade = new Map(unidades.map((unidade) => [unidade.id, unidade.nome]))
  const itensDoPedido = new Map<string, ItemPedidoVenda[]>()
  for (const item of itens) itensDoPedido.set(item.pedidoId, [...(itensDoPedido.get(item.pedidoId) ?? []), item])

  return pedidos.map((pedido) => {
    const doPedido = (itensDoPedido.get(pedido.id) ?? []).filter((item) => item.quantidade > 0)
    const ordem = (item: ItemPedidoVenda) => produtos.get(item.produtoId)?.ordem ?? 0
    return {
      id: pedido.id,
      codigo: pedido.codigo,
      comprador: pedido.comprador,
      vendedor: pedido.vendedor,
      unidadeId: pedido.unidadeId,
      unidadeNome: pedido.unidadeId ? (nomeDaUnidade.get(pedido.unidadeId) ?? null) : null,
      daDiretoria: pedido.daDiretoria,
      entrega: pedido.entrega,
      endereco: pedido.endereco,
      taxaEntrega: pedido.taxaEntrega,
      observacao: pedido.observacao,
      pago: pedido.pago,
      forma: pedido.forma,
      entregueEm: pedido.entregueEm ? pedido.entregueEm.toISOString() : null,
      canceladoEm: pedido.canceladoEm ? pedido.canceladoEm.toISOString() : null,
      criadoEm: pedido.criadoEm.toISOString(),
      itens: doPedido
        .sort((a, b) => ordem(a) - ordem(b))
        .map((item) => {
          const produto = produtos.get(item.produtoId)
          return {
            produtoId: item.produtoId,
            nome: produto?.nome ?? '',
            nomeCurto: produto?.nomeCurto ?? '',
            quantidade: item.quantidade,
            precoGravado: item.precoGravado,
          }
        }),
      total: totalDoPedido(doPedido, pedido.taxaEntrega),
    }
  })
}

/** Filtro da aba: só "Todos" inclui os cancelados. */
function filtroDoPedido(filtro: Consulta['filtro']): Prisma.PedidoVendaWhereInput {
  if (filtro === 'A_PAGAR') return { canceladoEm: null, pago: false }
  if (filtro === 'A_ENTREGAR') return { canceladoEm: null, entregueEm: null }
  if (filtro === 'ENTREGUES') return { canceladoEm: null, entregueEm: { not: null } }
  return {}
}

interface MudancaDeItem {
  produtoId: string
  quantidade: number
  existente: ItemPedidoVenda | undefined
}

/** A lista da edição é o pedido inteiro: produto que o pedido tinha e não veio na lista zera. */
function mudancasDeItens(existentes: ItemPedidoVenda[], enviados: ItemDaEntrada[]): MudancaDeItem[] {
  const enviadosPorProduto = new Map(enviados.map((item) => [item.produtoId, item.quantidade]))
  const doPedido = existentes.map((existente) => ({
    produtoId: existente.produtoId,
    quantidade: enviadosPorProduto.get(existente.produtoId) ?? 0,
    existente,
  }))
  const jaNoPedido = new Set(existentes.map((existente) => existente.produtoId))
  const novos = enviados.filter((item) => !jaNoPedido.has(item.produtoId)).map((item) => ({ ...item, existente: undefined }))
  return [...doPedido, ...novos]
}

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vendas: VendasService,
  ) {}

  async listar(clubeId: string, vendaId: string, consulta: Consulta): Promise<PedidoListaSaida> {
    await this.exigirVenda(clubeId, vendaId)
    const candidatos = await this.prisma.pedidoVenda.findMany({
      where: { clubeId, vendaId, ...filtroDoPedido(consulta.filtro) },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      select: { id: true, codigo: true, comprador: true },
    })
    const termo = consulta.busca ? semAcento(consulta.busca) : ''
    const achados = termo
      ? candidatos.filter((pedido) => semAcento(pedido.codigo).includes(termo) || semAcento(pedido.comprador).includes(termo))
      : candidatos
    const ids = paginar(achados, consulta.pagina, PEDIDOS_POR_PAGINA).map((pedido) => pedido.id)
    const pedidos = await this.prisma.pedidoVenda.findMany({ where: { clubeId, vendaId, id: { in: ids } }, orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }] })
    return {
      itens: await saidasDosPedidos(this.prisma, clubeId, vendaId, pedidos),
      total: achados.length,
      pagina: consulta.pagina,
      porPagina: PEDIDOS_POR_PAGINA,
    }
  }

  async obter(clubeId: string, vendaId: string, pedidoId: string): Promise<PedidoSaida> {
    await this.exigirVenda(clubeId, vendaId)
    return this.saidaAtual(this.prisma, clubeId, vendaId, pedidoId)
  }

  /** O código é sorteado dentro da trava da venda: cancelados contam, então nunca se reaproveita. */
  lancar(clubeId: string, vendaId: string, entrada: Entrada): Promise<PedidoSaida> {
    return this.vendas.escrever(clubeId, vendaId, async (tx, venda) => {
      exigirVendaAberta(venda)
      const itens = entrada.itens.filter((item) => item.quantidade > 0)
      const produtos = await produtosDaVenda(tx, clubeId, vendaId)
      if (itens.some((item) => !produtos.get(item.produtoId)?.ativo)) throw new ErroApp('NAO_ENCONTRADO', PRODUTO_NAO_ENCONTRADO)
      if (entrada.unidadeId) await exigirUnidadeAtiva(tx, clubeId, entrada.unidadeId)
      const forma = entrada.pago ? await exigirFormaAceita(tx, clubeId, vendaId, entrada.forma) : null

      const codigo = await codigoLivreDoPedido(tx, clubeId, vendaId)
      const pedido = await tx.pedidoVenda.create({
        data: {
          clubeId,
          vendaId,
          codigo,
          comprador: entrada.comprador,
          vendedor: entrada.vendedor,
          unidadeId: entrada.unidadeId,
          daDiretoria: entrada.daDiretoria,
          entrega: entrada.entrega,
          endereco: entrada.entrega ? entrada.endereco : null,
          taxaEntrega: entrada.entrega ? venda.taxaEntrega : 0,
          observacao: entrada.observacao,
          pago: entrada.pago,
          forma,
        },
      })
      await tx.itemPedidoVenda.createMany({
        data: itens.map((item) => ({
          clubeId,
          pedidoId: pedido.id,
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          precoGravado: produtos.get(item.produtoId)?.preco ?? 0,
        })),
      })
      return this.saidaAtual(tx, clubeId, vendaId, pedido.id)
    })
  }

  editar(clubeId: string, vendaId: string, pedidoId: string, entrada: Edicao): Promise<PedidoSaida> {
    return this.vendas.escrever(clubeId, vendaId, async (tx, venda) => {
      exigirVendaAberta(venda)
      const pedido = await pedidoDaVenda(tx, clubeId, vendaId, pedidoId)
      exigirNaoCancelado(pedido)
      const existentes = await tx.itemPedidoVenda.findMany({ where: { clubeId, pedidoId } })
      const produtos = await produtosDaVenda(tx, clubeId, vendaId)
      const mudancas = mudancasDeItens(existentes, entrada.itens)

      // Item que o pedido já tinha segue válido mesmo com o produto desativado (D13); o que voltou de zero conta como item novo (D14).
      const novos = mudancas.filter((mudanca) => !mudanca.existente?.quantidade && mudanca.quantidade > 0)
      if (novos.some((mudanca) => !produtos.get(mudanca.produtoId)?.ativo)) throw new ErroApp('NAO_ENCONTRADO', PRODUTO_NAO_ENCONTRADO)
      const entregaMudou = entrada.entrega !== pedido.entrega
      const itensMudaram = mudancas.some((mudanca) => mudanca.quantidade !== (mudanca.existente?.quantidade ?? 0))
      if (pedido.pago && (itensMudaram || entregaMudou)) throw new ErroApp('CONFLITO', PEDIDO_PAGO)
      if (entrada.unidadeId && entrada.unidadeId !== pedido.unidadeId) await exigirUnidadeAtiva(tx, clubeId, entrada.unidadeId)

      await tx.pedidoVenda.updateMany({
        where: { clubeId, vendaId, id: pedidoId },
        data: {
          comprador: entrada.comprador,
          vendedor: entrada.vendedor,
          unidadeId: entrada.unidadeId,
          daDiretoria: entrada.daDiretoria,
          entrega: entrada.entrega,
          endereco: entrada.entrega ? entrada.endereco : null,
          taxaEntrega: entregaMudou ? (entrada.entrega ? venda.taxaEntrega : 0) : pedido.taxaEntrega,
          observacao: entrada.observacao,
        },
      })
      for (const { produtoId, quantidade, existente } of mudancas) {
        if (existente && existente.quantidade === 0 && quantidade > 0) {
          const precoGravado = produtos.get(produtoId)?.preco ?? 0
          await tx.itemPedidoVenda.updateMany({ where: { clubeId, pedidoId, id: existente.id }, data: { quantidade, precoGravado } })
        } else if (existente && existente.quantidade !== quantidade) {
          await tx.itemPedidoVenda.updateMany({ where: { clubeId, pedidoId, id: existente.id }, data: { quantidade } })
        } else if (!existente && quantidade > 0) {
          const precoGravado = produtos.get(produtoId)?.preco ?? 0
          await tx.itemPedidoVenda.create({ data: { clubeId, pedidoId, produtoId, quantidade, precoGravado } })
        }
      }
      return this.saidaAtual(tx, clubeId, vendaId, pedidoId)
    })
  }

  /** Pagar de novo atualiza a forma. */
  pagar(clubeId: string, vendaId: string, pedidoId: string, pagamento: Pagamento): Promise<PedidoSaida> {
    return this.mudarPedido(clubeId, vendaId, pedidoId, async (tx, pedido) => {
      exigirNaoCancelado(pedido)
      const forma = await exigirFormaAceita(tx, clubeId, vendaId, pagamento.forma)
      return { pago: true, forma }
    })
  }

  despagar(clubeId: string, vendaId: string, pedidoId: string): Promise<PedidoSaida> {
    return this.mudarPedido(clubeId, vendaId, pedidoId, (_tx, pedido) => {
      exigirNaoCancelado(pedido)
      return { pago: false, forma: null }
    })
  }

  entregar(clubeId: string, vendaId: string, pedidoId: string): Promise<PedidoSaida> {
    return this.mudarPedido(clubeId, vendaId, pedidoId, (_tx, pedido) => {
      exigirNaoCancelado(pedido)
      return { entregueEm: pedido.entregueEm ?? new Date() }
    })
  }

  desentregar(clubeId: string, vendaId: string, pedidoId: string): Promise<PedidoSaida> {
    return this.mudarPedido(clubeId, vendaId, pedidoId, (_tx, pedido) => {
      exigirNaoCancelado(pedido)
      return { entregueEm: null }
    })
  }

  cancelar(clubeId: string, vendaId: string, pedidoId: string): Promise<PedidoSaida> {
    return this.mudarPedido(clubeId, vendaId, pedidoId, (_tx, pedido) => {
      if (pedido.canceladoEm) throw new ErroApp('CONFLITO', JA_CANCELADO)
      if (pedido.entregueEm) throw new ErroApp('CONFLITO', PEDIDO_ENTREGUE)
      return { canceladoEm: new Date() }
    })
  }

  reativar(clubeId: string, vendaId: string, pedidoId: string): Promise<PedidoSaida> {
    return this.mudarPedido(clubeId, vendaId, pedidoId, () => ({ canceladoEm: null }))
  }

  /** Venda aberta, pedido da venda da URL, regra do estado (em `decidir`) e só então a gravação. */
  private mudarPedido(
    clubeId: string,
    vendaId: string,
    pedidoId: string,
    decidir: (
      tx: Prisma.TransactionClient,
      pedido: PedidoVenda,
    ) => Prisma.PedidoVendaUncheckedUpdateManyInput | Promise<Prisma.PedidoVendaUncheckedUpdateManyInput>,
  ): Promise<PedidoSaida> {
    return this.vendas.escrever(clubeId, vendaId, async (tx, venda) => {
      exigirVendaAberta(venda)
      const pedido = await pedidoDaVenda(tx, clubeId, vendaId, pedidoId)
      const dados = await decidir(tx, pedido)
      await tx.pedidoVenda.updateMany({ where: { clubeId, vendaId, id: pedidoId }, data: dados })
      return this.saidaAtual(tx, clubeId, vendaId, pedidoId)
    })
  }

  private async exigirVenda(clubeId: string, vendaId: string): Promise<void> {
    const venda = await this.prisma.vendaArrecadacao.findFirst({ where: { clubeId, id: vendaId }, select: { id: true } })
    if (!venda) throw new ErroApp('NAO_ENCONTRADO', VENDA_NAO_ENCONTRADA)
  }

  private async saidaAtual(banco: Banco, clubeId: string, vendaId: string, pedidoId: string): Promise<PedidoSaida> {
    const pedido = await pedidoDaVenda(banco, clubeId, vendaId, pedidoId)
    const [saida] = await saidasDosPedidos(banco, clubeId, vendaId, [pedido])
    return saida
  }
}
