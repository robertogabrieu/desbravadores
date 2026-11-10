import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type { PedidoSaida, VendaEntrada, VendaSaida } from '@desbravadores/shared'
import request from 'supertest'
import { criarAppDeTeste } from '../../test/app'
import { criarAcesso, criarClube, desconectarPrismaDeTeste, prismaDeTeste, type Acesso } from '../../test/fabricas'
import { corpo } from '../../test/p6'
import { ARMAZENAMENTO, type Armazenamento } from '../arquivos/armazenamento'

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')])
const GRANDE = 'O comprovante passa de 2,5 MB. Tire um print menor ou envie o PDF do banco.'

const vendaValida: VendaEntrada = {
  nome: 'Lasanha',
  taxaEntrega: 500,
  produtos: [{ nome: 'Lasanha', nomeCurto: 'Lasanha', preco: 3500 }],
  formas: [{ tipo: 'PIX', chave: 'clube@pix.com', favorecido: 'Clube' }],
}

describe('comprovante de pagamento do pedido', () => {
  let app: INestApplication
  let armazenamento: Armazenamento
  const servidor = (): Server => app.getHttpServer() as Server

  beforeAll(async () => {
    app = await criarAppDeTeste()
    armazenamento = app.get<Armazenamento>(ARMAZENAMENTO)
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  const com = (acesso: Acesso, metodo: 'get' | 'post' | 'delete', caminho: string, dados?: object): request.Test => {
    const req = request(servidor())[metodo](caminho).set('Authorization', acesso.autorizacao)
    return dados ? req.send(dados) : req
  }

  async function cenario(pago = true) {
    const clube = await criarClube()
    const acesso = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const venda = corpo<VendaSaida>(await com(acesso, 'post', '/api/vendas', vendaValida))
    const pedido = corpo<PedidoSaida>(
      await com(acesso, 'post', `/api/vendas/${venda.id}/pedidos`, { comprador: 'Maria', itens: [{ produtoId: venda.produtos[0].id, quantidade: 2 }], pago, forma: pago ? 'PIX' : null }),
    )
    return { clube, acesso, venda, pedido }
  }
  type Cenario = Awaited<ReturnType<typeof cenario>>

  const rota = (c: Pick<Cenario, 'venda' | 'pedido'>) => `/api/vendas/${c.venda.id}/pedidos/${c.pedido.id}/comprovante`

  const enviar = (c: Cenario, dados: Buffer, nome = 'comprovante.jpg', acesso: Acesso = c.acesso) =>
    request(servidor()).post(rota(c)).set('Authorization', acesso.autorizacao).attach('arquivo', dados, { filename: nome })

  const caminhoGuardado = async (id: string) => (await prismaDeTeste().arquivo.findFirstOrThrow({ where: { id } })).caminho

  it('aceita foto e PDF pelos bytes (ignora a extensão), devolve id, tipo e URL, nunca o caminho', async () => {
    const c = await cenario()
    for (const [bytes, tipo] of [[JPEG, 'FOTO'], [PNG, 'FOTO'], [WEBP, 'FOTO'], [PDF, 'PDF']] as const) {
      const resposta = await enviar(c, bytes, 'qualquer.txt')
      expect(resposta.status).toBe(201)
      const { comprovante } = corpo<PedidoSaida>(resposta)
      expect(comprovante?.tipo).toBe(tipo)
      expect(comprovante?.url).toMatch(/^\/api\/arquivos\/.+sig=/)
      expect(JSON.stringify(resposta.body)).not.toContain('clube/')
      const lido = await request(servidor()).get(comprovante?.url ?? '')
      expect(lido.status).toBe(200)
    }
  })

  it('recusa o que não é foto nem PDF (422) e não grava nada', async () => {
    const c = await cenario()
    const resposta = await enviar(c, Buffer.from('MZ executavel'), 'virus.pdf')
    expect(resposta.status).toBe(422)
    expect(resposta.body).toMatchObject({ codigo: 'REGRA', mensagem: 'Envie uma foto (JPEG, PNG ou WebP) ou um PDF.' })
    expect(corpo<PedidoSaida>(await com(c.acesso, 'get', `/api/vendas/${c.venda.id}/pedidos/${c.pedido.id}`)).comprovante).toBeNull()
  })

  it('recusa acima de 2,5 MB com a mensagem clara e aceita o que cabe', async () => {
    const c = await cenario()
    const grande = Buffer.concat([PDF, Buffer.alloc(2.5 * 1024 * 1024)])
    const recusada = await enviar(c, grande)
    expect(recusada.status).toBe(422)
    expect(recusada.body).toMatchObject({ codigo: 'REGRA', mensagem: GRANDE })
    const cabe = await enviar(c, Buffer.concat([PDF, Buffer.alloc(2 * 1024 * 1024)]))
    expect(cabe.status).toBe(201)
  })

  it('sem arquivo responde 400 de validação', async () => {
    const c = await cenario()
    const resposta = await com(c.acesso, 'post', rota(c))
    expect(resposta.status).toBe(400)
  })

  it('trocar guarda só o novo: o arquivo antigo sai do banco e do disco', async () => {
    const c = await cenario()
    const primeiro = corpo<PedidoSaida>(await enviar(c, JPEG)).comprovante
    const caminhoAntigo = await caminhoGuardado(primeiro?.arquivoId ?? '')
    const segundo = corpo<PedidoSaida>(await enviar(c, PDF)).comprovante
    expect(segundo).toMatchObject({ tipo: 'PDF' })
    expect(segundo?.arquivoId).not.toBe(primeiro?.arquivoId)
    expect(await prismaDeTeste().arquivo.count({ where: { id: primeiro?.arquivoId } })).toBe(0)
    expect(() => armazenamento.abrir(caminhoAntigo)).toThrow()
  })

  it('remover apaga o comprovante; remover de novo é inofensivo', async () => {
    const c = await cenario()
    const enviado = corpo<PedidoSaida>(await enviar(c, PNG)).comprovante
    const caminho = await caminhoGuardado(enviado?.arquivoId ?? '')
    const removido = await com(c.acesso, 'delete', rota(c))
    expect(removido.status).toBe(200)
    expect(corpo<PedidoSaida>(removido).comprovante).toBeNull()
    expect(() => armazenamento.abrir(caminho)).toThrow()
    expect((await com(c.acesso, 'delete', rota(c))).status).toBe(200)
  })

  it('a lista e o resumo trazem o comprovante só com o pedido pago; desmarcar guarda o arquivo e marcar de novo o devolve', async () => {
    const c = await cenario()
    const enviado = corpo<PedidoSaida>(await enviar(c, PNG)).comprovante
    const base = `/api/vendas/${c.venda.id}/pedidos`
    const lista = corpo<{ itens: PedidoSaida[] }>(await com(c.acesso, 'get', base))
    expect(lista.itens[0].comprovante?.arquivoId).toBe(enviado?.arquivoId)

    await com(c.acesso, 'post', `${base}/${c.pedido.id}/despagar`)
    const escondido = corpo<PedidoSaida>(await com(c.acesso, 'get', `${base}/${c.pedido.id}`))
    expect(escondido.comprovante).toBeNull()
    expect(await prismaDeTeste().arquivo.count({ where: { id: enviado?.arquivoId } })).toBe(1)
    expect((await enviar(c, PNG)).status).toBe(409)
    expect((await com(c.acesso, 'delete', rota(c))).status).toBe(409)

    await com(c.acesso, 'post', `${base}/${c.pedido.id}/pagar`, { forma: 'PIX' })
    expect(corpo<PedidoSaida>(await com(c.acesso, 'get', `${base}/${c.pedido.id}`)).comprovante?.arquivoId).toBe(enviado?.arquivoId)
  })

  it('pedido ainda não pago recusa o envio (409)', async () => {
    const c = await cenario(false)
    const resposta = await enviar(c, PNG)
    expect(resposta.status).toBe(409)
    expect(await prismaDeTeste().arquivo.count({ where: { clubeId: c.clube.id } })).toBe(0)
  })

  it('venda encerrada só lê: recusa trocar e remover (409) e o arquivo continua abrindo', async () => {
    const c = await cenario()
    const enviado = corpo<PedidoSaida>(await enviar(c, PNG)).comprovante
    await com(c.acesso, 'post', `/api/vendas/${c.venda.id}/encerrar`)
    expect((await enviar(c, PDF)).body).toMatchObject({ codigo: 'CONFLITO', mensagem: 'Esta venda foi encerrada. Reabra para alterar.' })
    expect((await com(c.acesso, 'delete', rota(c))).status).toBe(409)
    const lido = corpo<PedidoSaida>(await com(c.acesso, 'get', `/api/vendas/${c.venda.id}/pedidos/${c.pedido.id}`))
    expect(lido.comprovante?.arquivoId).toBe(enviado?.arquivoId)
    expect((await request(servidor()).get(lido.comprovante?.url ?? '')).status).toBe(200)
  })

  it('pedido cancelado recusa (409)', async () => {
    const c = await cenario()
    await com(c.acesso, 'post', `/api/vendas/${c.venda.id}/pedidos/${c.pedido.id}/cancelar`)
    expect((await enviar(c, PNG)).status).toBe(409)
  })

  it('outro clube recebe 404 e nada muda; pedido de outra venda do mesmo clube também (404)', async () => {
    const c = await cenario()
    const enviado = corpo<PedidoSaida>(await enviar(c, PNG)).comprovante
    const intruso = await cenario()
    const doutro = await criarAcesso({ clubeId: intruso.clube.id, papel: 'ADM' })
    expect((await enviar(c, PDF, 'x.pdf', doutro)).status).toBe(404)
    expect((await com(doutro, 'delete', rota(c))).status).toBe(404)

    const outraVenda = corpo<VendaSaida>(await com(c.acesso, 'post', '/api/vendas', vendaValida))
    const cruzada = `/api/vendas/${outraVenda.id}/pedidos/${c.pedido.id}/comprovante`
    expect((await request(servidor()).post(cruzada).set('Authorization', c.acesso.autorizacao).attach('arquivo', PDF, { filename: 'x.pdf' })).status).toBe(404)
    expect((await com(c.acesso, 'delete', cruzada)).status).toBe(404)

    const atual = await prismaDeTeste().pedidoVenda.findFirstOrThrow({ where: { id: c.pedido.id } })
    expect(atual.comprovanteId).toBe(enviado?.arquivoId)
  })

  it('exige a permissão de gerenciar vendas', async () => {
    const c = await cenario()
    const sem = await criarAcesso({ clubeId: c.clube.id, papel: 'CONSELHEIRO' })
    expect((await enviar(c, PNG, 'x.png', sem)).status).toBe(403)
    expect((await com(sem, 'delete', rota(c))).status).toBe(403)
  })
})
