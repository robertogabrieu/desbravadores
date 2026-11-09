import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type { VendaEntrada, VendaListaSaida, VendaSaida } from '@desbravadores/shared'
import request from 'supertest'
import { criarAppDeTeste } from '../../test/app'
import { criarAcesso, criarClube, desconectarPrismaDeTeste, prismaDeTeste, type Acesso } from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { corpo } from '../../test/p6'

const ENCERRADA = 'Esta venda foi encerrada. Reabra para alterar.'

function vendaValida(sobrescrever: Partial<VendaEntrada> = {}): VendaEntrada {
  return {
    nome: 'Lasanha de outubro',
    taxaEntrega: 500,
    retiradaData: '2026-11-15',
    retiradaHorario: '9h às 12h',
    retiradaLocal: 'Salão da igreja',
    instrucoes: 'Aquecer por 20 minutos.',
    produtos: [
      { nome: 'Lasanha de carne', nomeCurto: 'Carne', preco: 3500 },
      { nome: 'Lasanha de frango', nomeCurto: 'Frango', preco: 3200 },
    ],
    formas: [
      { tipo: 'PIX', chave: 'clube@pix.com', favorecido: 'Clube Alfa' },
      { tipo: 'DINHEIRO' },
    ],
    ...sobrescrever,
  }
}

describe('vendas de arrecadação', () => {
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

  async function adm() {
    const clube = await criarClube()
    return { clube, adm: await criarAcesso({ clubeId: clube.id, papel: 'ADM' }) }
  }

  async function criarVenda(acesso: Acesso, entrada: VendaEntrada = vendaValida()): Promise<VendaSaida> {
    const resposta = await com(acesso, 'post', '/api/vendas', entrada)
    expect(resposta.status).toBe(201)
    return corpo<VendaSaida>(resposta)
  }

  /** Pedido direto no banco, para conferir o resumo da lista sem passar pelo lançamento. */
  async function pedidoDireto(venda: VendaSaida, clubeId: string, dados: { numero: number; quantidade: number; pago?: boolean; cancelado?: boolean; taxa?: number }) {
    const pedido = await prismaDeTeste().pedidoVenda.create({
      data: {
        clubeId,
        vendaId: venda.id,
        codigo: `COD00${dados.numero}`,
        comprador: `Comprador ${dados.numero}`,
        taxaEntrega: dados.taxa ?? 0,
        pago: dados.pago ?? false,
        canceladoEm: dados.cancelado ? new Date() : null,
      },
    })
    await prismaDeTeste().itemPedidoVenda.create({
      data: { clubeId, pedidoId: pedido.id, produtoId: venda.produtos[0].id, quantidade: dados.quantidade, precoGravado: venda.produtos[0].preco },
    })
  }

  describe('criar e ler', () => {
    it('cria com produtos e formas e devolve a venda completa', async () => {
      const { adm: acesso } = await adm()
      const venda = await criarVenda(acesso)
      expect(venda).toMatchObject({ nome: 'Lasanha de outubro', taxaEntrega: 500, retiradaData: '2026-11-15', encerradaEm: null })
      expect(venda.produtos.map((p) => [p.nomeCurto, p.ordem, p.ativo])).toEqual([['Carne', 0, true], ['Frango', 1, true]])
      expect(venda.formas.map((f) => f.tipo).sort()).toEqual(['DINHEIRO', 'PIX'])
      const lida = corpo<VendaSaida>(await com(acesso, 'get', `/api/vendas/${venda.id}`))
      expect(lida).toEqual(venda)
    })

    it('retirada e instruções são opcionais', async () => {
      const { adm: acesso } = await adm()
      const venda = await criarVenda(acesso, vendaValida({ retiradaData: null, retiradaHorario: '', retiradaLocal: undefined, instrucoes: null }))
      expect(venda).toMatchObject({ retiradaData: null, retiradaHorario: null, retiradaLocal: null, instrucoes: null })
    })

    it('recusa venda sem produto e sem forma de pagamento', async () => {
      const { adm: acesso } = await adm()
      const semProduto = await com(acesso, 'post', '/api/vendas', vendaValida({ produtos: [] }))
      expect(semProduto.status).toBe(400)
      expect(corpo<{ campos: Record<string, string> }>(semProduto).campos.produtos).toBe('Cadastre ao menos um produto.')
      const semForma = await com(acesso, 'post', '/api/vendas', vendaValida({ formas: [] }))
      expect(semForma.status).toBe(400)
      expect(corpo<{ campos: Record<string, string> }>(semForma).campos.formas).toBe('Escolha ao menos uma forma de pagamento.')
    })

    it('recusa Pix sem chave e duas formas do mesmo tipo', async () => {
      const { adm: acesso } = await adm()
      const semChave = await com(acesso, 'post', '/api/vendas', vendaValida({ formas: [{ tipo: 'PIX', chave: '', favorecido: 'Clube' }] }))
      expect(semChave.status).toBe(400)
      const repetida = await com(acesso, 'post', '/api/vendas', vendaValida({ formas: [{ tipo: 'DINHEIRO' }, { tipo: 'DINHEIRO' }] }))
      expect(repetida.status).toBe(400)
    })
  })

  describe('lista', () => {
    it('traz a aberta primeiro e os números só de pedidos ativos, com a taxa gravada', async () => {
      const { clube, adm: acesso } = await adm()
      const velha = await criarVenda(acesso, vendaValida({ nome: 'Velha' }))
      const recente = await criarVenda(acesso, vendaValida({ nome: 'Recente' }))
      const vazia = await criarVenda(acesso, vendaValida({ nome: 'Vazia' }))
      await com(acesso, 'post', `/api/vendas/${recente.id}/encerrar`)
      await pedidoDireto(velha, clube.id, { numero: 1, quantidade: 2, pago: true, taxa: 500 })
      await pedidoDireto(velha, clube.id, { numero: 2, quantidade: 1 })
      await pedidoDireto(velha, clube.id, { numero: 3, quantidade: 9, pago: true, cancelado: true })

      const { vendas } = corpo<VendaListaSaida>(await com(acesso, 'get', '/api/vendas'))
      expect(vendas.map((v) => v.nome)).toEqual(['Vazia', 'Velha', 'Recente'])
      const resumoVelha = vendas.find((v) => v.id === velha.id)
      expect(resumoVelha).toMatchObject({ pedidos: 2, unidadesVendidas: 3, vendido: 2 * 3500 + 500 + 3500, recebido: 2 * 3500 + 500 })
      expect(vendas.find((v) => v.id === vazia.id)).toMatchObject({ pedidos: 0, unidadesVendidas: 0, vendido: 0, recebido: 0 })
    })

    it('não mostra vendas nem pedidos de outro clube', async () => {
      const a = await adm()
      const b = await adm()
      const vendaB = await criarVenda(b.adm)
      await pedidoDireto(vendaB, b.clube.id, { numero: 1, quantidade: 4, pago: true })
      await criarVenda(a.adm)
      const { vendas } = corpo<VendaListaSaida>(await com(a.adm, 'get', '/api/vendas'))
      expect(vendas).toHaveLength(1)
      expect(vendas[0]).toMatchObject({ pedidos: 0, vendido: 0 })
    })
  })

  describe('editar', () => {
    it('produto sem id é novo, ausente é desativado e preço novo não toca pedido existente', async () => {
      const { clube, adm: acesso } = await adm()
      const venda = await criarVenda(acesso)
      const [carne, frango] = venda.produtos
      await pedidoDireto(venda, clube.id, { numero: 1, quantidade: 2 })

      const resposta = await com(acesso, 'patch', `/api/vendas/${venda.id}`, {
        ...vendaValida({ taxaEntrega: 900 }),
        produtos: [
          { id: carne.id, nome: 'Lasanha de carne', nomeCurto: 'Carne', preco: 4000 },
          { nome: 'Suco', nomeCurto: 'Suco', preco: 600 },
        ],
      })
      expect(resposta.status).toBe(200)
      const editada = corpo<VendaSaida>(resposta)
      expect(editada.taxaEntrega).toBe(900)
      const porNome = (nomeCurto: string) => editada.produtos.find((p) => p.nomeCurto === nomeCurto)
      expect(porNome('Carne')).toMatchObject({ preco: 4000, ordem: 0, ativo: true })
      expect(porNome('Suco')).toMatchObject({ preco: 600, ordem: 1, ativo: true })
      expect(editada.produtos.find((p) => p.id === frango.id)?.ativo).toBe(false)
      const item = await prismaDeTeste().itemPedidoVenda.findFirstOrThrow({ where: { clubeId: clube.id } })
      expect(item.precoGravado).toBe(3500)
      expect(await prismaDeTeste().produtoVenda.count({ where: { vendaId: venda.id } })).toBe(3)
    })

    it('produto desativado volta ao reaparecer com o id', async () => {
      const { adm: acesso } = await adm()
      const venda = await criarVenda(acesso)
      const [carne, frango] = venda.produtos
      const sem = { ...vendaValida(), produtos: [{ id: carne.id, nome: 'Lasanha de carne', nomeCurto: 'Carne', preco: 3500 }] }
      await com(acesso, 'patch', `/api/vendas/${venda.id}`, sem)
      const volta = {
        ...vendaValida(),
        produtos: [
          { id: carne.id, nome: 'Lasanha de carne', nomeCurto: 'Carne', preco: 3500 },
          { id: frango.id, nome: 'Lasanha de frango', nomeCurto: 'Frango', preco: 3300 },
        ],
      }
      const editada = corpo<VendaSaida>(await com(acesso, 'patch', `/api/vendas/${venda.id}`, volta))
      expect(editada.produtos.find((p) => p.id === frango.id)).toMatchObject({ ativo: true, preco: 3300 })
    })

    it('forma desativada que volta sem id é reativada e atualizada, sem criar outra', async () => {
      const { adm: acesso } = await adm()
      const venda = await criarVenda(acesso)
      const pix = venda.formas.find((f) => f.tipo === 'PIX')
      await com(acesso, 'patch', `/api/vendas/${venda.id}`, { ...vendaValida(), formas: [{ tipo: 'DINHEIRO' }] })
      const intermediaria = corpo<VendaSaida>(await com(acesso, 'get', `/api/vendas/${venda.id}`))
      expect(intermediaria.formas.find((f) => f.tipo === 'PIX')?.ativo).toBe(false)

      const resposta = await com(acesso, 'patch', `/api/vendas/${venda.id}`, {
        ...vendaValida(),
        formas: [{ tipo: 'PIX', chave: 'nova@pix.com', favorecido: 'Tesouraria' }, { tipo: 'DINHEIRO' }],
      })
      expect(resposta.status).toBe(200)
      const editada = corpo<VendaSaida>(resposta)
      expect(editada.formas).toHaveLength(2)
      expect(editada.formas.find((f) => f.tipo === 'PIX')).toMatchObject({ id: pix?.id, ativo: true, chave: 'nova@pix.com', favorecido: 'Tesouraria' })
    })

    it('forma que sai da lista é desativada, nunca apagada', async () => {
      const { adm: acesso } = await adm()
      const venda = await criarVenda(acesso)
      const editada = corpo<VendaSaida>(await com(acesso, 'patch', `/api/vendas/${venda.id}`, { ...vendaValida(), formas: [{ tipo: 'SETE_ME', orientacao: 'Ofertas > Desbravadores' }] }))
      expect(editada.formas.map((f) => [f.tipo, f.ativo]).sort()).toEqual([['DINHEIRO', false], ['PIX', false], ['SETE_ME', true]])
    })

    it('id de produto ou forma de outra venda responde 404', async () => {
      const { adm: acesso } = await adm()
      const venda = await criarVenda(acesso)
      const outra = await criarVenda(acesso)
      const produto = await com(acesso, 'patch', `/api/vendas/${venda.id}`, {
        ...vendaValida(),
        produtos: [{ id: outra.produtos[0].id, nome: 'x', nomeCurto: 'x', preco: 100 }],
      })
      expect(produto.status).toBe(404)
      expect(corpo<{ mensagem: string }>(produto).mensagem).toBe('Produto não encontrado nesta venda.')
      const forma = await com(acesso, 'patch', `/api/vendas/${venda.id}`, { ...vendaValida(), formas: [{ id: outra.formas[0].id, tipo: 'DINHEIRO' }] })
      expect(forma.status).toBe(404)
    })

    it('lista vazia de produtos ou formas é recusada e a venda não muda', async () => {
      const { adm: acesso } = await adm()
      const venda = await criarVenda(acesso)
      expect((await com(acesso, 'patch', `/api/vendas/${venda.id}`, vendaValida({ produtos: [] }))).status).toBe(400)
      expect((await com(acesso, 'patch', `/api/vendas/${venda.id}`, vendaValida({ formas: [] }))).status).toBe(400)
      expect(corpo<VendaSaida>(await com(acesso, 'get', `/api/vendas/${venda.id}`))).toEqual(venda)
    })
  })

  describe('encerrar e reabrir', () => {
    it('encerra, bloqueia edição e novo encerramento (409) e reabre', async () => {
      const { adm: acesso } = await adm()
      const venda = await criarVenda(acesso)
      const encerrada = await com(acesso, 'post', `/api/vendas/${venda.id}/encerrar`)
      expect(encerrada.status).toBe(201)
      expect(corpo<VendaSaida>(encerrada).encerradaEm).not.toBeNull()

      const edicao = await com(acesso, 'patch', `/api/vendas/${venda.id}`, vendaValida({ nome: 'Outro nome' }))
      expect(edicao.status).toBe(409)
      expect(corpo<{ mensagem: string }>(edicao).mensagem).toBe(ENCERRADA)
      const outra = await com(acesso, 'post', `/api/vendas/${venda.id}/encerrar`)
      expect(outra.status).toBe(409)
      expect(corpo<{ mensagem: string }>(outra).mensagem).toBe(ENCERRADA)
      expect(corpo<VendaSaida>(await com(acesso, 'get', `/api/vendas/${venda.id}`)).nome).toBe('Lasanha de outubro')

      const reaberta = await com(acesso, 'post', `/api/vendas/${venda.id}/reabrir`)
      expect(reaberta.status).toBe(201)
      expect(corpo<VendaSaida>(reaberta).encerradaEm).toBeNull()
      expect((await com(acesso, 'patch', `/api/vendas/${venda.id}`, vendaValida({ nome: 'Outro nome' }))).status).toBe(200)
    })
  })

  describe('permissão', () => {
    it('papel sem venda.gerenciar não alcança nenhuma rota', async () => {
      const { clube, adm: dono } = await adm()
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      const venda = await criarVenda(dono)
      const tentativas = [
        com(conselheiro, 'get', '/api/vendas'),
        com(conselheiro, 'post', '/api/vendas', vendaValida()),
        com(conselheiro, 'get', `/api/vendas/${venda.id}`),
        com(conselheiro, 'patch', `/api/vendas/${venda.id}`, vendaValida()),
        com(conselheiro, 'post', `/api/vendas/${venda.id}/encerrar`),
        com(conselheiro, 'post', `/api/vendas/${venda.id}/reabrir`),
      ]
      for (const resposta of await Promise.all(tentativas)) expect(resposta.status).toBe(403)
    })

    it('id que não é UUID responde erro de validação', async () => {
      const { adm: acesso } = await adm()
      expect((await com(acesso, 'get', '/api/vendas/nao-e-uuid')).status).toBe(400)
    })
  })

  describe('isolamento', () => {
    async function semearVenda(clubeB: { id: string }) {
      const dono = await criarAcesso({ clubeId: clubeB.id, papel: 'ADM' })
      const venda = await criarVenda(dono)
      const intacto = async () => {
        const atual = await prismaDeTeste().vendaArrecadacao.findFirstOrThrow({ where: { id: venda.id } })
        expect(atual.nome).toBe('Lasanha de outubro')
        expect(atual.encerradaEm).toBeNull()
      }
      return { venda, intacto }
    }

    testarIsolamento({
      titulo: 'GET /vendas/:id',
      app: () => app,
      papel: 'ADM',
      semear: async (clubeB) => ({ metodo: 'get', caminho: `/api/vendas/${(await semearVenda(clubeB)).venda.id}` }),
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'PATCH /vendas/:id',
      app: () => app,
      papel: 'ADM',
      semear: async (clubeB) => {
        const { venda, intacto } = await semearVenda(clubeB)
        return { metodo: 'patch', caminho: `/api/vendas/${venda.id}`, corpo: vendaValida({ nome: 'Invadida' }), conferirIntacto: intacto }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'POST /vendas/:id/encerrar',
      app: () => app,
      papel: 'ADM',
      semear: async (clubeB) => {
        const { venda, intacto } = await semearVenda(clubeB)
        return { metodo: 'post', caminho: `/api/vendas/${venda.id}/encerrar`, conferirIntacto: intacto }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'POST /vendas/:id/reabrir',
      app: () => app,
      papel: 'ADM',
      semear: async (clubeB) => {
        const { venda } = await semearVenda(clubeB)
        await prismaDeTeste().vendaArrecadacao.update({ where: { id: venda.id }, data: { encerradaEm: new Date() } })
        return {
          metodo: 'post',
          caminho: `/api/vendas/${venda.id}/reabrir`,
          conferirIntacto: async () => {
            const atual = await prismaDeTeste().vendaArrecadacao.findFirstOrThrow({ where: { id: venda.id } })
            expect(atual.encerradaEm).not.toBeNull()
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'GET /vendas',
      app: () => app,
      papel: 'ADM',
      semear: async (clubeB) => {
        const { venda } = await semearVenda(clubeB)
        return { metodo: 'get', caminho: '/api/vendas', idsDoOutroClube: [venda.id] }
      },
      esperado: { tipo: 'LISTA_SEM_OS_IDS' },
    })
  })
})
