import { Injectable } from '@nestjs/common'
import { totalDoPedido, type VendaEntrada, type VendaListaSaida, type VendaResumoSaida, type VendaSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import type { FormaPagamentoVenda, Prisma, ProdutoVenda, VendaArrecadacao } from '../generated/prisma/client.js'
import { exigirVendaAberta, travarVenda, VENDA_NAO_ENCONTRADA } from './constantes'

const TEMPO_DA_TRANSACAO_MS = 20_000

const PRODUTO_NAO_ENCONTRADO = 'Produto não encontrado nesta venda.'
const FORMA_NAO_ENCONTRADA = 'Forma de pagamento não encontrada nesta venda.'
const SEM_PRODUTO = 'Cadastre ao menos um produto.'
const SEM_FORMA = 'Escolha ao menos uma forma de pagamento.'
const PRODUTO_REPETIDO = 'Cada produto aparece uma vez.'

type Entrada = z.output<typeof VendaEntrada>
type ProdutoDaEntrada = Entrada['produtos'][number]
type FormaDaEntrada = Entrada['formas'][number]

/** O que a tela e o detalhe leem da venda, com produtos e formas (inclusive os desativados). */
const COM_PRODUTOS_E_FORMAS = (clubeId: string) =>
  ({
    produtos: { where: { clubeId }, orderBy: { ordem: 'asc' } },
    formas: { where: { clubeId }, orderBy: { tipo: 'asc' } },
  }) satisfies Prisma.VendaArrecadacaoInclude

type VendaLida = VendaArrecadacao & { produtos: ProdutoVenda[]; formas: FormaPagamentoVenda[] }

function saidaDaForma(forma: FormaPagamentoVenda): VendaSaida['formas'][number] {
  const base = { id: forma.id, ativo: forma.ativo }
  if (forma.tipo === 'PIX') return { ...base, tipo: 'PIX', chave: forma.chave ?? '', favorecido: forma.favorecido ?? '' }
  if (forma.tipo === 'SETE_ME') return { ...base, tipo: 'SETE_ME', orientacao: forma.orientacao ?? '' }
  return { ...base, tipo: 'DINHEIRO' }
}

function saidaDaVenda(venda: VendaArrecadacao) {
  return {
    id: venda.id,
    nome: venda.nome,
    taxaEntrega: venda.taxaEntrega,
    retiradaData: venda.retiradaData ? paraDataCivil(venda.retiradaData) : null,
    retiradaHorario: venda.retiradaHorario,
    retiradaLocal: venda.retiradaLocal,
    instrucoes: venda.instrucoes,
    encerradaEm: venda.encerradaEm ? venda.encerradaEm.toISOString() : null,
    criadoEm: venda.criadoEm.toISOString(),
  }
}

function saidaCompleta(venda: VendaLida): VendaSaida {
  return {
    ...saidaDaVenda(venda),
    produtos: venda.produtos.map(({ id, nome, nomeCurto, preco, ordem, ativo }) => ({ id, nome, nomeCurto, preco, ordem, ativo })),
    formas: venda.formas.map(saidaDaForma),
  }
}

/** Só os campos do tipo escolhido ficam preenchidos; os outros voltam a nulo. */
function dadosDaForma(forma: FormaDaEntrada) {
  return {
    tipo: forma.tipo,
    chave: forma.tipo === 'PIX' ? forma.chave : null,
    favorecido: forma.tipo === 'PIX' ? forma.favorecido : null,
    orientacao: forma.tipo === 'SETE_ME' ? forma.orientacao : null,
    ativo: true,
  }
}

function dadosDoProduto({ nome, nomeCurto, preco }: ProdutoDaEntrada, ordem: number) {
  return { nome, nomeCurto, preco, ordem, ativo: true }
}

@Injectable()
export class VendasService {
  constructor(private readonly prisma: PrismaService) {}

  /** A aberta primeiro; dentro de cada grupo, a mais recente. Os números contam só pedidos ativos. */
  async listar(clubeId: string): Promise<VendaListaSaida> {
    const vendas = await this.prisma.vendaArrecadacao.findMany({ where: { clubeId }, orderBy: { criadoEm: 'desc' } })
    const pedidos = await this.prisma.pedidoVenda.findMany({
      where: { clubeId, vendaId: { in: vendas.map((venda) => venda.id) }, canceladoEm: null },
      select: { vendaId: true, taxaEntrega: true, pago: true, itens: { where: { clubeId }, select: { quantidade: true, precoGravado: true } } },
    })
    const resumos = new Map<string, Pick<VendaResumoSaida, 'pedidos' | 'unidadesVendidas' | 'vendido' | 'recebido'>>()
    for (const pedido of pedidos) {
      const resumo = resumos.get(pedido.vendaId) ?? { pedidos: 0, unidadesVendidas: 0, vendido: 0, recebido: 0 }
      const total = totalDoPedido(pedido.itens, pedido.taxaEntrega)
      resumo.pedidos += 1
      resumo.unidadesVendidas += pedido.itens.reduce((soma, item) => soma + item.quantidade, 0)
      resumo.vendido += total
      if (pedido.pago) resumo.recebido += total
      resumos.set(pedido.vendaId, resumo)
    }
    const resumidas = vendas.map((venda) => ({
      ...saidaDaVenda(venda),
      ...(resumos.get(venda.id) ?? { pedidos: 0, unidadesVendidas: 0, vendido: 0, recebido: 0 }),
    }))
    return { vendas: [...resumidas.filter((venda) => !venda.encerradaEm), ...resumidas.filter((venda) => venda.encerradaEm)] }
  }

  async obter(clubeId: string, id: string): Promise<VendaSaida> {
    const venda = await this.prisma.vendaArrecadacao.findFirst({ where: { clubeId, id }, include: COM_PRODUTOS_E_FORMAS(clubeId) })
    if (!venda) throw new ErroApp('NAO_ENCONTRADO', VENDA_NAO_ENCONTRADA)
    return saidaCompleta(venda)
  }

  async criar(clubeId: string, entrada: Entrada): Promise<VendaSaida> {
    const { produtos, formas, retiradaData, ...dados } = entrada
    exigirAoMenosUmDeCada(produtos.length, formas.length)
    const id = await this.prisma.$transaction(async (tx) => {
      const venda = await tx.vendaArrecadacao.create({
        data: { clubeId, ...dados, retiradaData: retiradaData ? daDataCivil(retiradaData) : null },
      })
      await tx.produtoVenda.createMany({
        data: produtos.map((produto, ordem) => ({ clubeId, vendaId: venda.id, ...dadosDoProduto(produto, ordem) })),
      })
      await tx.formaPagamentoVenda.createMany({ data: formas.map((forma) => ({ clubeId, vendaId: venda.id, ...dadosDaForma(forma) })) })
      return venda.id
    })
    return this.obter(clubeId, id)
  }

  /**
   * Produto ou forma sem `id` é novo; ausente da lista é desativado, nunca apagado. Preço e taxa novos
   * não tocam os pedidos: eles guardam o valor que tinham ao ser lançados.
   */
  async atualizar(clubeId: string, id: string, entrada: Entrada): Promise<VendaSaida> {
    const { produtos, formas, retiradaData, ...dados } = entrada
    await this.escrever(clubeId, id, async (tx, venda) => {
      exigirVendaAberta(venda)
      exigirAoMenosUmDeCada(produtos.length, formas.length)
      await tx.vendaArrecadacao.updateMany({
        where: { clubeId, id },
        data: { ...dados, retiradaData: retiradaData ? daDataCivil(retiradaData) : null },
      })
      await this.gravarProdutos(tx, clubeId, id, produtos)
      await this.gravarFormas(tx, clubeId, id, formas)
    })
    return this.obter(clubeId, id)
  }

  async encerrar(clubeId: string, id: string): Promise<VendaSaida> {
    await this.escrever(clubeId, id, async (tx, venda) => {
      exigirVendaAberta(venda)
      await tx.vendaArrecadacao.updateMany({ where: { clubeId, id }, data: { encerradaEm: new Date() } })
    })
    return this.obter(clubeId, id)
  }

  /** Única escrita permitida numa venda encerrada. */
  async reabrir(clubeId: string, id: string): Promise<VendaSaida> {
    await this.escrever(clubeId, id, async (tx) => {
      await tx.vendaArrecadacao.updateMany({ where: { clubeId, id }, data: { encerradaEm: null } })
    })
    return this.obter(clubeId, id)
  }

  /**
   * Toda escrita de uma venda (a dela e a dos pedidos) passa aqui: abre a transação, toma a trava da venda
   * e só então lê a venda do clube (404 se não for dele). Conferência de estado vai dentro de `trabalho`,
   * nunca antes. Venda encerrada não é recusada aqui: quem escreve chama `exigirVendaAberta`.
   */
  escrever<T>(
    clubeId: string,
    vendaId: string,
    trabalho: (tx: Prisma.TransactionClient, venda: VendaArrecadacao) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await travarVenda(tx, vendaId)
        const venda = await tx.vendaArrecadacao.findFirst({ where: { clubeId, id: vendaId } })
        if (!venda) throw new ErroApp('NAO_ENCONTRADO', VENDA_NAO_ENCONTRADA)
        return trabalho(tx, venda)
      },
      { timeout: TEMPO_DA_TRANSACAO_MS },
    )
  }

  private async gravarProdutos(tx: Prisma.TransactionClient, clubeId: string, vendaId: string, entrada: ProdutoDaEntrada[]): Promise<void> {
    const ids = entrada.flatMap((produto) => (produto.id ? [produto.id] : []))
    if (new Set(ids).size !== ids.length) throw new ErroApp('REGRA', PRODUTO_REPETIDO)
    const existentes = await tx.produtoVenda.findMany({ where: { clubeId, vendaId }, select: { id: true } })
    const daVenda = new Set(existentes.map((produto) => produto.id))
    if (ids.some((id) => !daVenda.has(id))) throw new ErroApp('NAO_ENCONTRADO', PRODUTO_NAO_ENCONTRADO)

    await tx.produtoVenda.updateMany({ where: { clubeId, vendaId, id: { notIn: ids } }, data: { ativo: false } })
    for (const [ordem, produto] of entrada.entries()) {
      if (produto.id) {
        await tx.produtoVenda.updateMany({ where: { clubeId, vendaId, id: produto.id }, data: dadosDoProduto(produto, ordem) })
      } else {
        await tx.produtoVenda.create({ data: { clubeId, vendaId, ...dadosDoProduto(produto, ordem) } })
      }
    }
  }

  /** A forma é única por tipo na venda: o tipo é quem a identifica, então uma desativada que volta é reativada. */
  private async gravarFormas(tx: Prisma.TransactionClient, clubeId: string, vendaId: string, entrada: FormaDaEntrada[]): Promise<void> {
    const existentes = await tx.formaPagamentoVenda.findMany({ where: { clubeId, vendaId } })
    const daVenda = new Set(existentes.map((forma) => forma.id))
    if (entrada.some((forma) => forma.id && !daVenda.has(forma.id))) throw new ErroApp('NAO_ENCONTRADO', FORMA_NAO_ENCONTRADA)

    const tipos = entrada.map((forma) => forma.tipo)
    await tx.formaPagamentoVenda.updateMany({ where: { clubeId, vendaId, tipo: { notIn: tipos } }, data: { ativo: false } })
    for (const forma of entrada) {
      const dados = dadosDaForma(forma)
      const atual = existentes.find((existente) => existente.tipo === forma.tipo)
      if (atual) {
        await tx.formaPagamentoVenda.updateMany({ where: { clubeId, vendaId, id: atual.id }, data: dados })
      } else {
        await tx.formaPagamentoVenda.create({ data: { clubeId, vendaId, ...dados } })
      }
    }
  }
}

/** O contrato já recusa lista vazia (400); aqui fica a garantia do que de fato sobra ativo depois de salvar. */
function exigirAoMenosUmDeCada(produtosAtivos: number, formasAtivas: number): void {
  if (produtosAtivos === 0) throw new ErroApp('REGRA', SEM_PRODUTO)
  if (formasAtivas === 0) throw new ErroApp('REGRA', SEM_FORMA)
}
