import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type { PedidoEntrada, PedidoListaSaida, PedidoSaida, VendaEntrada, VendaPainelSaida, VendaSaida } from '@desbravadores/shared'
import { totalDoPedido } from '@desbravadores/shared'
import request from 'supertest'
import { criarAppDeTeste } from '../../test/app'
import { criarAcesso, criarClube, criarUnidade, desconectarPrismaDeTeste, prismaDeTeste, type Acesso } from '../../test/fabricas'
import { corpo } from '../../test/p6'

const ENCERRADA = 'Esta venda foi encerrada. Reabra para alterar.'
const PAGO = 'Pedido já pago. Desmarque o pagamento para mudar o valor.'
const CANCELADO = 'Pedido cancelado. Reative para alterar.'

function vendaValida(): VendaEntrada {
  return {
    nome: 'Lasanha',
    taxaEntrega: 500,
    produtos: [
      { nome: 'Lasanha de carne', nomeCurto: 'Carne', preco: 3500 },
      { nome: 'Lasanha de frango', nomeCurto: 'Frango', preco: 3200 },
    ],
    formas: [{ tipo: 'PIX', chave: 'clube@pix.com', favorecido: 'Clube' }, { tipo: 'DINHEIRO' }],
  }
}

describe('pedidos da venda', () => {
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

  async function cenario() {
    const clube = await criarClube()
    const acesso = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const resposta = await com(acesso, 'post', '/api/vendas', vendaValida())
    const venda = corpo<VendaSaida>(resposta)
    const [carne, frango] = venda.produtos
    return { clube, acesso, venda, carne, frango }
  }
  type Cenario = Awaited<ReturnType<typeof cenario>>

  const base = (c: Cenario) => `/api/vendas/${c.venda.id}/pedidos`

  function entrada(c: Cenario, sobrescrever: Partial<PedidoEntrada> = {}): PedidoEntrada {
    return { comprador: 'Maria', itens: [{ produtoId: c.carne.id, quantidade: 2 }], ...sobrescrever }
  }

  async function lancar(c: Cenario, sobrescrever: Partial<PedidoEntrada> = {}): Promise<PedidoSaida> {
    const resposta = await com(c.acesso, 'post', base(c), entrada(c, sobrescrever))
    expect(resposta.status).toBe(201)
    return corpo<PedidoSaida>(resposta)
  }

  const acao = (c: Cenario, pedido: PedidoSaida, nome: string, dados?: object) => com(c.acesso, 'post', `${base(c)}/${pedido.id}/${nome}`, dados)
  const mensagem = (resposta: request.Response) => corpo<{ mensagem: string }>(resposta).mensagem
  const campos = (resposta: request.Response) => corpo<{ campos: Record<string, string> }>(resposta).campos

  describe('lançar', () => {
    it('retirada: número 1, preço e total gravados, taxa zero', async () => {
      const c = await cenario()
      const pedido = await lancar(c)
      expect(pedido).toMatchObject({ numero: 1, comprador: 'Maria', entrega: false, taxaEntrega: 0, pago: false, forma: null, total: 7000 })
      expect(pedido.itens).toEqual([{ produtoId: c.carne.id, nome: 'Lasanha de carne', nomeCurto: 'Carne', quantidade: 2, precoGravado: 3500 }])
      expect((await lancar(c)).numero).toBe(2)
    })

    it('entrega grava a taxa da venda e o endereço; item de quantidade zero não é gravado', async () => {
      const c = await cenario()
      const pedido = await lancar(c, {
        entrega: true,
        endereco: 'Rua A, 10',
        itens: [{ produtoId: c.carne.id, quantidade: 1 }, { produtoId: c.frango.id, quantidade: 0 }],
      })
      expect(pedido).toMatchObject({ entrega: true, endereco: 'Rua A, 10', taxaEntrega: 500, total: 4000 })
      expect(await prismaDeTeste().itemPedidoVenda.count({ where: { pedidoId: pedido.id } })).toBe(1)
    })

    it('número nunca é reaproveitado: cancelado conta', async () => {
      const c = await cenario()
      const primeiro = await lancar(c)
      await acao(c, primeiro, 'cancelar')
      expect((await lancar(c)).numero).toBe(2)
    })

    it('lança já pago com forma; MISTO vale', async () => {
      const c = await cenario()
      expect(await lancar(c, { pago: true, forma: 'PIX' })).toMatchObject({ pago: true, forma: 'PIX' })
      expect(await lancar(c, { pago: true, forma: 'MISTO' })).toMatchObject({ forma: 'MISTO' })
    })

    it('pago sem forma responde 422', async () => {
      const c = await cenario()
      const resposta = await com(c.acesso, 'post', base(c), entrada(c, { pago: true }))
      expect(resposta.status).toBe(422)
      expect(mensagem(resposta)).toBe('Escolha a forma de pagamento.')
    })

    it('forma que a venda não aceita responde 422', async () => {
      const c = await cenario()
      const resposta = await com(c.acesso, 'post', base(c), entrada(c, { pago: true, forma: 'SETE_ME' }))
      expect(resposta.status).toBe(422)
      expect(mensagem(resposta)).toBe('Esta venda não aceita essa forma de pagamento.')
      expect(await prismaDeTeste().pedidoVenda.count({ where: { vendaId: c.venda.id } })).toBe(0)
    })

    it('entrega sem endereço, retirada com endereço e itens zerados são recusados na validação (400)', async () => {
      const c = await cenario()
      const semEndereco = await com(c.acesso, 'post', base(c), entrada(c, { entrega: true }))
      expect(semEndereco.status).toBe(400)
      expect(campos(semEndereco).endereco).toBe('Informe o endereço da entrega.')
      const comEndereco = await com(c.acesso, 'post', base(c), entrada(c, { endereco: 'Rua' }))
      expect(comEndereco.status).toBe(400)
      const zerado = await com(c.acesso, 'post', base(c), entrada(c, { itens: [{ produtoId: c.carne.id, quantidade: 0 }] }))
      expect(zerado.status).toBe(400)
      expect(campos(zerado).itens).toBe('Escolha ao menos uma unidade.')
      const repetido = await com(c.acesso, 'post', base(c), entrada(c, { itens: [{ produtoId: c.carne.id, quantidade: 1 }, { produtoId: c.carne.id, quantidade: 1 }] }))
      expect(repetido.status).toBe(400)
    })

    it('produto de outra venda ou inativo responde 404', async () => {
      const c = await cenario()
      const outra = corpo<VendaSaida>(await com(c.acesso, 'post', '/api/vendas', vendaValida()))
      const deOutra = await com(c.acesso, 'post', base(c), entrada(c, { itens: [{ produtoId: outra.produtos[0].id, quantidade: 1 }] }))
      expect(deOutra.status).toBe(404)
      expect(mensagem(deOutra)).toBe('Produto não encontrado nesta venda.')
      await prismaDeTeste().produtoVenda.update({ where: { id: c.frango.id }, data: { ativo: false } })
      const inativo = await com(c.acesso, 'post', base(c), entrada(c, { itens: [{ produtoId: c.frango.id, quantidade: 1 }] }))
      expect(inativo.status).toBe(404)
    })

    it('unidade: ativa vale; de outro clube ou desativada responde 404; Diretoria vale', async () => {
      const c = await cenario()
      const unidade = await criarUnidade({ clubeId: c.clube.id, nome: 'Águias' })
      expect(await lancar(c, { unidadeId: unidade.id })).toMatchObject({ unidadeId: unidade.id, unidadeNome: 'Águias', daDiretoria: false })
      expect(await lancar(c, { daDiretoria: true })).toMatchObject({ daDiretoria: true, unidadeId: null })
      const outroClube = await criarClube()
      const alheia = await criarUnidade({ clubeId: outroClube.id })
      const deOutro = await com(c.acesso, 'post', base(c), entrada(c, { unidadeId: alheia.id }))
      expect(deOutro.status).toBe(404)
      expect(mensagem(deOutro)).toBe('Unidade não encontrada.')
      await prismaDeTeste().unidade.update({ where: { id: unidade.id }, data: { ativa: false } })
      expect((await com(c.acesso, 'post', base(c), entrada(c, { unidadeId: unidade.id }))).status).toBe(404)
    })

    it('diretoria e unidade juntas são recusadas (400)', async () => {
      const c = await cenario()
      const unidade = await criarUnidade({ clubeId: c.clube.id })
      expect((await com(c.acesso, 'post', base(c), entrada(c, { unidadeId: unidade.id, daDiretoria: true }))).status).toBe(400)
    })

    it('venda encerrada recusa o lançamento (409)', async () => {
      const c = await cenario()
      await com(c.acesso, 'post', `/api/vendas/${c.venda.id}/encerrar`)
      const resposta = await com(c.acesso, 'post', base(c), entrada(c))
      expect(resposta.status).toBe(409)
      expect(mensagem(resposta)).toBe(ENCERRADA)
    })
  })

  describe('editar', () => {
    const edicao = (c: Cenario, sobrescrever: Partial<PedidoEntrada> = {}) => {
      const { pago: _pago, forma: _forma, ...resto } = entrada(c, sobrescrever)
      return resto
    }
    const editar = (c: Cenario, pedido: PedidoSaida, dados: object) => com(c.acesso, 'patch', `${base(c)}/${pedido.id}`, dados)

    it('item existente mantém o preço gravado e o novo usa o preço atual', async () => {
      const c = await cenario()
      const pedido = await lancar(c)
      await prismaDeTeste().produtoVenda.update({ where: { id: c.carne.id }, data: { preco: 4000 } })
      await prismaDeTeste().produtoVenda.update({ where: { id: c.frango.id }, data: { preco: 3300 } })
      const resposta = await editar(c, pedido, edicao(c, { itens: [{ produtoId: c.carne.id, quantidade: 3 }, { produtoId: c.frango.id, quantidade: 1 }] }))
      expect(resposta.status).toBe(200)
      const editado = corpo<PedidoSaida>(resposta)
      expect(editado.itens.map((i) => [i.nomeCurto, i.quantidade, i.precoGravado])).toEqual([['Carne', 3, 3500], ['Frango', 1, 3300]])
      expect(editado.total).toBe(3 * 3500 + 3300)
    })

    it('trocar para entrega grava a taxa atual da venda; voltar para retirada zera taxa e endereço', async () => {
      const c = await cenario()
      const pedido = await lancar(c)
      await prismaDeTeste().vendaArrecadacao.update({ where: { id: c.venda.id }, data: { taxaEntrega: 900 } })
      const entrega = corpo<PedidoSaida>(await editar(c, pedido, edicao(c, { entrega: true, endereco: 'Rua B' })))
      expect(entrega).toMatchObject({ entrega: true, taxaEntrega: 900, endereco: 'Rua B' })
      const retirada = corpo<PedidoSaida>(await editar(c, pedido, edicao(c)))
      expect(retirada).toMatchObject({ entrega: false, taxaEntrega: 0, endereco: null })
    })

    it('item que zera fica com quantidade 0, some da saída e volta com o preço gravado', async () => {
      const c = await cenario()
      const pedido = await lancar(c, { itens: [{ produtoId: c.carne.id, quantidade: 2 }, { produtoId: c.frango.id, quantidade: 1 }] })
      const zerado = corpo<PedidoSaida>(await editar(c, pedido, edicao(c, { itens: [{ produtoId: c.carne.id, quantidade: 2 }] })))
      expect(zerado.itens.map((i) => i.nomeCurto)).toEqual(['Carne'])
      const linha = await prismaDeTeste().itemPedidoVenda.findFirstOrThrow({ where: { pedidoId: pedido.id, produtoId: c.frango.id } })
      expect(linha.quantidade).toBe(0)
      await prismaDeTeste().produtoVenda.update({ where: { id: c.frango.id }, data: { preco: 9900 } })
      const volta = corpo<PedidoSaida>(await editar(c, pedido, edicao(c, { itens: [{ produtoId: c.carne.id, quantidade: 2 }, { produtoId: c.frango.id, quantidade: 4 }] })))
      expect(volta.itens.find((i) => i.nomeCurto === 'Frango')).toMatchObject({ quantidade: 4, precoGravado: 3200 })
    })

    it('produto desativado: o item que o pedido já tinha continua; item novo é recusado', async () => {
      const c = await cenario()
      const pedido = await lancar(c, { itens: [{ produtoId: c.frango.id, quantidade: 1 }] })
      await prismaDeTeste().produtoVenda.updateMany({ where: { vendaId: c.venda.id }, data: { ativo: false } })
      expect((await editar(c, pedido, edicao(c, { itens: [{ produtoId: c.frango.id, quantidade: 5 }] }))).status).toBe(200)
      const novo = await editar(c, pedido, edicao(c, { itens: [{ produtoId: c.frango.id, quantidade: 5 }, { produtoId: c.carne.id, quantidade: 1 }] }))
      expect(novo.status).toBe(404)
      expect(mensagem(novo)).toBe('Produto não encontrado nesta venda.')
    })

    it('pedido pago recusa mudar itens ou entrega (409), mas aceita outro contato com os mesmos itens', async () => {
      const c = await cenario()
      const pedido = await lancar(c, { pago: true, forma: 'PIX' })
      const itens = await editar(c, pedido, edicao(c, { itens: [{ produtoId: c.carne.id, quantidade: 3 }] }))
      expect(itens.status).toBe(409)
      expect(mensagem(itens)).toBe(PAGO)
      const entrega = await editar(c, pedido, edicao(c, { entrega: true, endereco: 'Rua' }))
      expect(entrega.status).toBe(409)
      const contato = await editar(c, pedido, edicao(c, { comprador: 'Joana', observacao: 'sem cebola' }))
      expect(contato.status).toBe(200)
      expect(corpo<PedidoSaida>(contato)).toMatchObject({ comprador: 'Joana', observacao: 'sem cebola', pago: true, total: 7000 })
    })

    it('unidade só precisa estar ativa quando muda', async () => {
      const c = await cenario()
      const antiga = await criarUnidade({ clubeId: c.clube.id, nome: 'Antiga' })
      const pedido = await lancar(c, { unidadeId: antiga.id })
      await prismaDeTeste().unidade.update({ where: { id: antiga.id }, data: { ativa: false } })
      expect((await editar(c, pedido, edicao(c, { unidadeId: antiga.id, comprador: 'Nova' }))).status).toBe(200)
      const outra = await criarUnidade({ clubeId: c.clube.id, nome: 'Outra' })
      await prismaDeTeste().unidade.update({ where: { id: outra.id }, data: { ativa: false } })
      const resposta = await editar(c, pedido, edicao(c, { unidadeId: outra.id }))
      expect(resposta.status).toBe(404)
      expect(mensagem(resposta)).toBe('Unidade não encontrada.')
    })

    it('pedido cancelado e venda encerrada recusam a edição (409)', async () => {
      const c = await cenario()
      const pedido = await lancar(c)
      await acao(c, pedido, 'cancelar')
      const cancelado = await editar(c, pedido, edicao(c))
      expect(cancelado.status).toBe(409)
      expect(mensagem(cancelado)).toBe(CANCELADO)
      await acao(c, pedido, 'reativar')
      await com(c.acesso, 'post', `/api/vendas/${c.venda.id}/encerrar`)
      const encerrada = await editar(c, pedido, edicao(c))
      expect(encerrada.status).toBe(409)
      expect(mensagem(encerrada)).toBe(ENCERRADA)
    })
  })

  describe('pagar, entregar e cancelar', () => {
    it('pagar guarda a forma, é idempotente e atualiza a forma; despagar limpa', async () => {
      const c = await cenario()
      const pedido = await lancar(c)
      expect(corpo<PedidoSaida>(await acao(c, pedido, 'pagar', { forma: 'PIX' }))).toMatchObject({ pago: true, forma: 'PIX' })
      expect(corpo<PedidoSaida>(await acao(c, pedido, 'pagar', { forma: 'DINHEIRO' }))).toMatchObject({ pago: true, forma: 'DINHEIRO' })
      expect(corpo<PedidoSaida>(await acao(c, pedido, 'despagar'))).toMatchObject({ pago: false, forma: null })
    })

    it('pagar com forma fora das aceitas responde 422; sem forma responde 400', async () => {
      const c = await cenario()
      const pedido = await lancar(c)
      const fora = await acao(c, pedido, 'pagar', { forma: 'SETE_ME' })
      expect(fora.status).toBe(422)
      expect(mensagem(fora)).toBe('Esta venda não aceita essa forma de pagamento.')
      expect((await acao(c, pedido, 'pagar', {})).status).toBe(400)
    })

    it('forma desativada da venda não vale para novo pagamento, mas o pedido antigo a mantém', async () => {
      const c = await cenario()
      const pedido = await lancar(c, { pago: true, forma: 'DINHEIRO' })
      await prismaDeTeste().formaPagamentoVenda.updateMany({ where: { vendaId: c.venda.id, tipo: 'DINHEIRO' }, data: { ativo: false } })
      expect(corpo<PedidoSaida>(await com(c.acesso, 'get', `${base(c)}/${pedido.id}`)).forma).toBe('DINHEIRO')
      expect((await acao(c, await lancar(c), 'pagar', { forma: 'DINHEIRO' })).status).toBe(422)
    })

    it('entregar e desentregar são idempotentes e o instante não muda ao repetir', async () => {
      const c = await cenario()
      const pedido = await lancar(c)
      const primeira = corpo<PedidoSaida>(await acao(c, pedido, 'entregar'))
      expect(primeira.entregueEm).not.toBeNull()
      expect(corpo<PedidoSaida>(await acao(c, pedido, 'entregar')).entregueEm).toBe(primeira.entregueEm)
      expect(corpo<PedidoSaida>(await acao(c, pedido, 'desentregar')).entregueEm).toBeNull()
      expect(corpo<PedidoSaida>(await acao(c, pedido, 'desentregar')).entregueEm).toBeNull()
    })

    it('cancelar entregue responde 409; desentregar libera; cancelar duas vezes responde 409', async () => {
      const c = await cenario()
      const pedido = await lancar(c)
      await acao(c, pedido, 'entregar')
      const entregue = await acao(c, pedido, 'cancelar')
      expect(entregue.status).toBe(409)
      expect(mensagem(entregue)).toBe('Pedido já entregue. Desmarque a entrega antes de cancelar.')
      await acao(c, pedido, 'desentregar')
      expect(corpo<PedidoSaida>(await acao(c, pedido, 'cancelar')).canceladoEm).not.toBeNull()
      const outra = await acao(c, pedido, 'cancelar')
      expect(outra.status).toBe(409)
      expect(mensagem(outra)).toBe('Este pedido já está cancelado.')
    })

    it('pedido cancelado só aceita reativar; reativar ativo é idempotente', async () => {
      const c = await cenario()
      const pedido = await lancar(c)
      expect((await acao(c, pedido, 'reativar')).status).toBe(201)
      await acao(c, pedido, 'cancelar')
      for (const [nome, dados] of [['pagar', { forma: 'PIX' }], ['despagar'], ['entregar'], ['desentregar']] as const) {
        const resposta = await acao(c, pedido, nome, dados)
        expect([nome, resposta.status, mensagem(resposta)]).toEqual([nome, 409, CANCELADO])
      }
      expect(corpo<PedidoSaida>(await acao(c, pedido, 'reativar')).canceladoEm).toBeNull()
    })

    it('venda encerrada recusa pagar, entregar e cancelar (409)', async () => {
      const c = await cenario()
      const pedido = await lancar(c)
      await com(c.acesso, 'post', `/api/vendas/${c.venda.id}/encerrar`)
      for (const [nome, dados] of [['pagar', { forma: 'PIX' }], ['despagar'], ['entregar'], ['desentregar'], ['cancelar'], ['reativar']] as const) {
        const resposta = await acao(c, pedido, nome, dados)
        expect([nome, resposta.status, mensagem(resposta)]).toEqual([nome, 409, ENCERRADA])
      }
    })
  })

  describe('listar', () => {
    it('filtros, busca sem acento ou por número, ordem decrescente e paginação de 20', async () => {
      const c = await cenario()
      const nomes = ['José', 'Ana', 'Beatriz']
      const pedidos: PedidoSaida[] = []
      for (const comprador of nomes) pedidos.push(await lancar(c, { comprador }))
      await acao(c, pedidos[0], 'pagar', { forma: 'PIX' })
      await acao(c, pedidos[1], 'entregar')
      await acao(c, pedidos[2], 'cancelar')
      const listar = async (consulta: string) => corpo<PedidoListaSaida>(await com(c.acesso, 'get', `${base(c)}?${consulta}`))

      const todos = await listar('')
      expect(todos.itens.map((p) => p.numero)).toEqual([3, 2, 1])
      expect(todos).toMatchObject({ total: 3, pagina: 1, porPagina: 20 })
      expect((await listar('filtro=A_PAGAR')).itens.map((p) => p.numero)).toEqual([2])
      expect((await listar('filtro=A_ENTREGAR')).itens.map((p) => p.numero)).toEqual([1])
      expect((await listar('filtro=ENTREGUES')).itens.map((p) => p.numero)).toEqual([2])
      expect((await listar('busca=jose')).itens.map((p) => p.numero)).toEqual([1])
      expect((await listar('busca=2')).itens.map((p) => p.numero)).toEqual([2])

      for (let i = 0; i < 20; i += 1) await lancar(c, { comprador: `Extra ${i}` })
      const segunda = await listar('pagina=2')
      expect(segunda).toMatchObject({ total: 23, pagina: 2 })
      expect(segunda.itens.map((p) => p.numero)).toEqual([3, 2, 1])
    })

    it('total da saída e o painel batem com totalDoPedido, mesmo depois de mudar o preço da venda', async () => {
      const c = await cenario()
      const pedido = await lancar(c, { entrega: true, endereco: 'Rua', itens: [{ produtoId: c.carne.id, quantidade: 2 }, { produtoId: c.frango.id, quantidade: 1 }] })
      await com(c.acesso, 'patch', `/api/vendas/${c.venda.id}`, {
        ...vendaValida(),
        taxaEntrega: 1500,
        produtos: [
          { id: c.carne.id, nome: 'Lasanha de carne', nomeCurto: 'Carne', preco: 5000 },
          { id: c.frango.id, nome: 'Lasanha de frango', nomeCurto: 'Frango', preco: 4800 },
        ],
      })
      const lido = corpo<PedidoSaida>(await com(c.acesso, 'get', `${base(c)}/${pedido.id}`))
      const esperado = totalDoPedido([{ quantidade: 2, precoGravado: 3500 }, { quantidade: 1, precoGravado: 3200 }], 500)
      expect(lido.total).toBe(esperado)
      const painel = corpo<VendaPainelSaida>(await com(c.acesso, 'get', `/api/vendas/${c.venda.id}/painel`))
      expect(painel.vendido).toBe(esperado)
    })
  })
})
