import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type { VendaSaida } from '@desbravadores/shared'
import request from 'supertest'
import { criarAppDeTeste } from '../../test/app'
import { criarAcesso, criarClube, desconectarPrismaDeTeste, prismaDeTeste, type Acesso } from '../../test/fabricas'
import { corpo } from '../../test/p6'

describe('vendas: escritas simultâneas', () => {
  let app: INestApplication
  const servidor = (): Server => app.getHttpServer() as Server

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  const com = (acesso: Acesso, caminho: string, dados?: object): request.Test => {
    const req = request(servidor()).post(caminho).set('Authorization', acesso.autorizacao)
    return dados ? req.send(dados) : req
  }

  async function novaVenda() {
    const clube = await criarClube()
    const acesso = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const venda = corpo<VendaSaida>(
      await com(acesso, '/api/vendas', {
        nome: 'Lasanha',
        taxaEntrega: 0,
        produtos: [{ nome: 'Lasanha', nomeCurto: 'Lasanha', preco: 3500 }],
        formas: [{ tipo: 'DINHEIRO' }],
      }),
    )
    return { acesso, venda }
  }

  const lancar = (acesso: Acesso, venda: VendaSaida, comprador: string) =>
    com(acesso, `/api/vendas/${venda.id}/pedidos`, { comprador, itens: [{ produtoId: venda.produtos[0].id, quantidade: 1 }] })

  it('dez lançamentos juntos geram números distintos e consecutivos', async () => {
    const { acesso, venda } = await novaVenda()
    const respostas = await Promise.all(Array.from({ length: 10 }, (_, i) => lancar(acesso, venda, `Comprador ${i}`)))
    expect(respostas.map((r) => r.status)).toEqual(Array(10).fill(201))
    const numeros = respostas.map((r) => corpo<{ numero: number }>(r).numero).sort((a, b) => a - b)
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('lançar e encerrar em corrida: ou o pedido entra antes de encerrar, ou é recusado e não grava', async () => {
    for (let rodada = 0; rodada < 5; rodada += 1) {
      const { acesso, venda } = await novaVenda()
      const [lancamento, encerramento] = await Promise.all([lancar(acesso, venda, 'Corrida'), com(acesso, `/api/vendas/${venda.id}/encerrar`)])
      expect(encerramento.status).toBe(201)
      expect([201, 409]).toContain(lancamento.status)
      const gravados = await prismaDeTeste().pedidoVenda.count({ where: { vendaId: venda.id } })
      expect(gravados).toBe(lancamento.status === 201 ? 1 : 0)
      const depois = await lancar(acesso, venda, 'Depois')
      expect(depois.status).toBe(409)
    }
  })
})
