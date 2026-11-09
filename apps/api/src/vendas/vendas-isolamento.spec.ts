import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type { PedidoSaida, VendaEntrada, VendaSaida } from '@desbravadores/shared'
import request from 'supertest'
import { criarAppDeTeste } from '../../test/app'
import { criarAcesso, criarClube, criarUnidade, desconectarPrismaDeTeste, prismaDeTeste, type Acesso } from '../../test/fabricas'
import { testarIsolamento, type PedidoContraOutroClube } from '../../test/isolamento'
import { corpo } from '../../test/p6'
import type { Clube } from '../generated/prisma/client.js'

const vendaValida: VendaEntrada = {
  nome: 'Lasanha',
  taxaEntrega: 500,
  produtos: [{ nome: 'Lasanha', nomeCurto: 'Lasanha', preco: 3500 }],
  formas: [{ tipo: 'DINHEIRO' }],
}

describe('vendas: pedidos e painel entre clubes e entre vendas', () => {
  let app: INestApplication
  const servidor = (): Server => app.getHttpServer() as Server

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  const com = (acesso: Acesso, metodo: 'get' | 'post' | 'patch', caminho: string, dados?: object): request.Test => {
    const req = request(servidor())[metodo](caminho).set('Authorization', acesso.autorizacao)
    return dados ? req.send(dados) : req
  }

  async function semear(clube: Pick<Clube, 'id'>) {
    const dono = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const venda = corpo<VendaSaida>(await com(dono, 'post', '/api/vendas', vendaValida))
    const pedido = corpo<PedidoSaida>(
      await com(dono, 'post', `/api/vendas/${venda.id}/pedidos`, { comprador: 'Maria', itens: [{ produtoId: venda.produtos[0].id, quantidade: 2 }] }),
    )
    return { dono, venda, pedido }
  }

  const corpoDoPedido = (produtoId: string) => ({ comprador: 'Invasor', itens: [{ produtoId, quantidade: 1 }] })

  async function intacto(pedidoId: string): Promise<void> {
    const atual = await prismaDeTeste().pedidoVenda.findFirstOrThrow({ where: { id: pedidoId } })
    expect(atual).toMatchObject({ comprador: 'Maria', pago: false, entregueEm: null, canceladoEm: null })
  }

  type Rota = [titulo: string, montar: (venda: VendaSaida, pedido: PedidoSaida) => Omit<PedidoContraOutroClube, 'conferirIntacto'>]
  const rotas: Rota[] = [
    ['GET painel', (v) => ({ metodo: 'get', caminho: `/api/vendas/${v.id}/painel` })],
    ['GET pedidos', (v) => ({ metodo: 'get', caminho: `/api/vendas/${v.id}/pedidos` })],
    ['POST pedidos', (v) => ({ metodo: 'post', caminho: `/api/vendas/${v.id}/pedidos`, corpo: corpoDoPedido(v.produtos[0].id) })],
    ['GET pedido', (v, p) => ({ metodo: 'get', caminho: `/api/vendas/${v.id}/pedidos/${p.id}` })],
    ['PATCH pedido', (v, p) => ({ metodo: 'patch', caminho: `/api/vendas/${v.id}/pedidos/${p.id}`, corpo: corpoDoPedido(v.produtos[0].id) })],
    ['pagar', (v, p) => ({ metodo: 'post', caminho: `/api/vendas/${v.id}/pedidos/${p.id}/pagar`, corpo: { forma: 'DINHEIRO' } })],
    ['despagar', (v, p) => ({ metodo: 'post', caminho: `/api/vendas/${v.id}/pedidos/${p.id}/despagar` })],
    ['entregar', (v, p) => ({ metodo: 'post', caminho: `/api/vendas/${v.id}/pedidos/${p.id}/entregar` })],
    ['desentregar', (v, p) => ({ metodo: 'post', caminho: `/api/vendas/${v.id}/pedidos/${p.id}/desentregar` })],
    ['cancelar', (v, p) => ({ metodo: 'post', caminho: `/api/vendas/${v.id}/pedidos/${p.id}/cancelar` })],
    ['reativar', (v, p) => ({ metodo: 'post', caminho: `/api/vendas/${v.id}/pedidos/${p.id}/reativar` })],
  ]

  for (const [titulo, montar] of rotas) {
    testarIsolamento({
      titulo: `${titulo} (Adm de outro clube)`,
      app: () => app,
      papel: 'ADM',
      semear: async (clubeB) => {
        const { venda, pedido } = await semear(clubeB)
        return { ...montar(venda, pedido), conferirIntacto: () => intacto(pedido.id) }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })
  }

  describe('pedido da venda A pela URL da venda B (mesmo clube)', () => {
    it.each(rotas.filter(([titulo]) => !['GET painel', 'GET pedidos', 'POST pedidos'].includes(titulo)))('%s responde 404 e não muda nada', async (_titulo, montar) => {
      const clube = await criarClube()
      const { dono, venda: vendaA, pedido } = await semear(clube)
      const vendaB = corpo<VendaSaida>(await com(dono, 'post', '/api/vendas', vendaValida))
      const alvo = montar(vendaB, pedido)
      const resposta = await com(dono, alvo.metodo as 'get' | 'post' | 'patch', alvo.caminho, alvo.corpo)
      expect(resposta.status).toBe(404)
      expect(corpo<{ mensagem: string }>(resposta).mensagem).toBe('Pedido não encontrado.')
      await intacto(pedido.id)
      expect(vendaA.id).not.toBe(vendaB.id)
    })
  })

  describe('referências de outro clube dentro do corpo', () => {
    it('lançar com produto ou unidade de outro clube responde 404, sem pedido novo', async () => {
      const a = await semear(await criarClube())
      const b = await semear(await criarClube())
      const unidadeB = await criarUnidade({ clubeId: (await prismaDeTeste().vendaArrecadacao.findFirstOrThrow({ where: { id: b.venda.id } })).clubeId })
      const produto = await com(a.dono, 'post', `/api/vendas/${a.venda.id}/pedidos`, corpoDoPedido(b.venda.produtos[0].id))
      expect(produto.status).toBe(404)
      const unidade = await com(a.dono, 'post', `/api/vendas/${a.venda.id}/pedidos`, { ...corpoDoPedido(a.venda.produtos[0].id), unidadeId: unidadeB.id })
      expect(unidade.status).toBe(404)
      expect(await prismaDeTeste().pedidoVenda.count({ where: { vendaId: a.venda.id } })).toBe(1)
    })

    it('editar com produto de outra venda ou unidade de outro clube respondem 404, sem mudar o pedido', async () => {
      const a = await semear(await criarClube())
      const outraVenda = corpo<VendaSaida>(await com(a.dono, 'post', '/api/vendas', vendaValida))
      const clubeB = await criarClube()
      const unidadeB = await criarUnidade({ clubeId: clubeB.id })
      const caminho = `/api/vendas/${a.venda.id}/pedidos/${a.pedido.id}`
      const produto = await com(a.dono, 'patch', caminho, { ...corpoDoPedido(a.venda.produtos[0].id), itens: [{ produtoId: outraVenda.produtos[0].id, quantidade: 1 }] })
      expect(produto.status).toBe(404)
      const unidade = await com(a.dono, 'patch', caminho, { ...corpoDoPedido(a.venda.produtos[0].id), unidadeId: unidadeB.id })
      expect(unidade.status).toBe(404)
      await intacto(a.pedido.id)
      expect(await prismaDeTeste().itemPedidoVenda.count({ where: { pedidoId: a.pedido.id } })).toBe(1)
    })
  })
})
