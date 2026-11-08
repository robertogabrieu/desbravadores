import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type { PedidoEntrada, PedidoSaida, VendaPainelSaida, VendaSaida } from '@desbravadores/shared'
import request from 'supertest'
import { criarAppDeTeste } from '../../test/app'
import { criarAcesso, criarClube, criarUnidade, desconectarPrismaDeTeste, prismaDeTeste, type Acesso } from '../../test/fabricas'
import { corpo } from '../../test/p6'

describe('painel da venda', () => {
  let app: INestApplication
  const servidor = (): Server => app.getHttpServer() as Server

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  const com = (acesso: Acesso, metodo: 'get' | 'post', caminho: string, dados?: object): request.Test => {
    const req = request(servidor())[metodo](caminho).set('Authorization', acesso.autorizacao)
    return dados ? req.send(dados) : req
  }

  async function cenario() {
    const clube = await criarClube()
    const acesso = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const venda = corpo<VendaSaida>(
      await com(acesso, 'post', '/api/vendas', {
        nome: 'Lasanha',
        taxaEntrega: 500,
        produtos: [
          { nome: 'Lasanha de carne', nomeCurto: 'Carne', preco: 3500 },
          { nome: 'Lasanha de frango', nomeCurto: 'Frango', preco: 3200 },
        ],
        formas: [{ tipo: 'PIX', chave: 'a@b.c', favorecido: 'Clube' }, { tipo: 'DINHEIRO' }],
      }),
    )
    return { clube, acesso, venda }
  }

  async function lancar(c: Awaited<ReturnType<typeof cenario>>, dados: Partial<PedidoEntrada>): Promise<PedidoSaida> {
    const resposta = await com(c.acesso, 'post', `/api/vendas/${c.venda.id}/pedidos`, {
      comprador: 'Maria',
      itens: [{ produtoId: c.venda.produtos[0].id, quantidade: 1 }],
      ...dados,
    })
    expect(resposta.status).toBe(201)
    return corpo<PedidoSaida>(resposta)
  }

  const painelDe = async (c: Awaited<ReturnType<typeof cenario>>) =>
    corpo<VendaPainelSaida>(await com(c.acesso, 'get', `/api/vendas/${c.venda.id}/painel`))

  it('venda sem pedido: tudo zerado, com linhas Diretoria e Sem unidade', async () => {
    const c = await cenario()
    const painel = await painelDe(c)
    expect(painel).toMatchObject({
      unidadesVendidas: 0,
      vendido: 0,
      recebido: 0,
      aReceber: 0,
      pedidosAPagar: 0,
      aEntregar: 0,
      entregues: 0,
      contadores: { todos: 0, aPagar: 0, aEntregar: 0, entregues: 0 },
    })
    expect(painel.porProduto.map((p) => [p.nomeCurto, p.unidades])).toEqual([['Carne', 0], ['Frango', 0]])
    expect(painel.porUnidade.map((l) => l.tipo)).toEqual(['DIRETORIA', 'SEM_UNIDADE'])
  })

  it('números do glossário: cancelado fica fora de tudo e só conta em "Todos"', async () => {
    const c = await cenario()
    const [carne, frango] = c.venda.produtos
    const pago = await lancar(c, { entrega: true, endereco: 'Rua', itens: [{ produtoId: carne.id, quantidade: 2 }, { produtoId: frango.id, quantidade: 1 }] })
    const entregue = await lancar(c, { itens: [{ produtoId: carne.id, quantidade: 1 }] })
    await lancar(c, { itens: [{ produtoId: frango.id, quantidade: 2 }] })
    const cancelado = await lancar(c, { itens: [{ produtoId: carne.id, quantidade: 9 }], pago: true, forma: 'PIX' })
    await com(c.acesso, 'post', `/api/vendas/${c.venda.id}/pedidos/${pago.id}/pagar`, { forma: 'PIX' })
    await com(c.acesso, 'post', `/api/vendas/${c.venda.id}/pedidos/${entregue.id}/entregar`)
    await com(c.acesso, 'post', `/api/vendas/${c.venda.id}/pedidos/${cancelado.id}/cancelar`)

    const painel = await painelDe(c)
    const totalPago = 2 * 3500 + 3200 + 500
    expect(painel).toMatchObject({
      unidadesVendidas: 2 + 1 + 1 + 2,
      vendido: totalPago + 3500 + 2 * 3200,
      recebido: totalPago,
      aReceber: 3500 + 2 * 3200,
      pedidosAPagar: 2,
      aEntregar: 2,
      entregues: 1,
      contadores: { todos: 4, aPagar: 2, aEntregar: 2, entregues: 1 },
    })
    expect(painel.porProduto.map((p) => [p.nomeCurto, p.unidades])).toEqual([['Carne', 3], ['Frango', 3]])
  })

  it('por unidade: desativada mantém a linha (ativa falso) se vendeu; Diretoria e Sem unidade separadas', async () => {
    const c = await cenario()
    const aguias = await criarUnidade({ clubeId: c.clube.id, nome: 'Águias' })
    const lobos = await criarUnidade({ clubeId: c.clube.id, nome: 'Lobos' })
    const falcoes = await criarUnidade({ clubeId: c.clube.id, nome: 'Falcões' })
    await lancar(c, { unidadeId: aguias.id, itens: [{ produtoId: c.venda.produtos[0].id, quantidade: 3 }] })
    await lancar(c, { unidadeId: lobos.id })
    await lancar(c, { daDiretoria: true, itens: [{ produtoId: c.venda.produtos[0].id, quantidade: 2 }] })
    await lancar(c, {})
    await prismaDeTeste().unidade.updateMany({ where: { id: { in: [lobos.id, falcoes.id] } }, data: { ativa: false } })

    const linhas = (await painelDe(c)).porUnidade
    expect(linhas.map((l) => [l.tipo, l.nome, l.ativa, l.unidades])).toEqual([
      ['UNIDADE', 'Águias', true, 3],
      ['UNIDADE', 'Lobos', false, 1],
      ['DIRETORIA', 'Diretoria', true, 2],
      ['SEM_UNIDADE', 'Sem unidade', true, 1],
    ])
  })

  it('não mistura pedidos de outra venda do mesmo clube', async () => {
    const c = await cenario()
    await lancar(c, {})
    const outra = corpo<VendaSaida>(
      await com(c.acesso, 'post', '/api/vendas', { nome: 'Outra', taxaEntrega: 0, produtos: [{ nome: 'x', nomeCurto: 'x', preco: 100 }], formas: [{ tipo: 'DINHEIRO' }] }),
    )
    const painel = corpo<VendaPainelSaida>(await com(c.acesso, 'get', `/api/vendas/${outra.id}/painel`))
    expect(painel).toMatchObject({ unidadesVendidas: 0, vendido: 0, contadores: { todos: 0 } })
  })
})
