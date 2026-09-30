import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { criarAppDeTeste, emailFalso } from '../../test/app'
import {
  criarAcesso,
  criarClube,
  criarDbv,
  criarMembro,
  criarUnidade,
  criarUsuario,
  criarVinculo,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  type Acesso,
} from '../../test/fabricas'

describe('POST /api/pedidos-ao-adm', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  beforeEach(() => emailFalso(app).limpar())

  const pedir = (acesso: Acesso, corpo: object): request.Test =>
    request(app.getHttpServer() as Server).post('/api/pedidos-ao-adm').set('Authorization', acesso.autorizacao).send(corpo)

  async function cenario() {
    const clube = await criarClube()
    const unidade = await criarUnidade({ clubeId: clube.id, nome: 'Águias' })
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
    const adm1 = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const adm2 = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    return { clube, unidade, conselheiro, adm1, adm2 }
  }

  const corpo = (unidadeId: string) => ({ tipo: 'UNIDADE_SEM_DBV', unidadeId })
  const pedidosDaUnidade = (clubeId: string, unidadeId: string) =>
    prismaDeTeste().pedidoAoAdm.findMany({ where: { clubeId, unidadeId } })

  it('unidade sem DBV: 204, grava o pedido e manda o e-mail a cada Adm ativo (so do clube)', async () => {
    const c = await cenario()
    const inativo = await criarUsuario()
    await criarVinculo({ usuarioId: inativo.id, clubeId: c.clube.id, papel: 'ADM', ativo: false })
    const outroClube = await criarClube()
    const admDeFora = await criarAcesso({ clubeId: outroClube.id, papel: 'ADM' })

    const resposta = await pedir(c.conselheiro, corpo(c.unidade.id))
    expect(resposta.status).toBe(204)

    const pedidos = await pedidosDaUnidade(c.clube.id, c.unidade.id)
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0]).toMatchObject({ tipo: 'UNIDADE_SEM_DBV', pedidoPorId: c.conselheiro.usuario.id })

    const enviadas = emailFalso(app).enviadas
    expect(enviadas.map((mensagem) => mensagem.para).sort()).toEqual([c.adm1.usuario.email, c.adm2.usuario.email].sort())
    expect(enviadas.map((mensagem) => mensagem.para)).not.toContain(inativo.email)
    expect(enviadas.map((mensagem) => mensagem.para)).not.toContain(admDeFora.usuario.email)
    for (const mensagem of enviadas) {
      expect(mensagem.assunto).toBe('A unidade Águias está sem desbravadores no app')
      expect(mensagem.texto).toBe(
        `${c.conselheiro.usuario.nome} pediu que você cadastre os desbravadores da unidade Águias. http://localhost:5173/adm/unidades`,
      )
    }
  })

  it('pedido repetido da mesma unidade em 24 h: 204 sem enviar e sem gravar outro', async () => {
    const c = await cenario()
    await pedir(c.conselheiro, corpo(c.unidade.id)).expect(204)
    emailFalso(app).limpar()
    const segunda = await pedir(c.conselheiro, corpo(c.unidade.id))
    expect(segunda.status).toBe(204)
    expect(emailFalso(app).enviadas).toHaveLength(0)
    expect(await pedidosDaUnidade(c.clube.id, c.unidade.id)).toHaveLength(1)
  })

  it('pedido de mais de 24 h atras nao conta: envia de novo', async () => {
    const c = await cenario()
    await pedir(c.conselheiro, corpo(c.unidade.id)).expect(204)
    await prismaDeTeste().pedidoAoAdm.updateMany({
      where: { clubeId: c.clube.id, unidadeId: c.unidade.id },
      data: { criadoEm: new Date(Date.now() - 25 * 3_600_000) },
    })
    emailFalso(app).limpar()
    await pedir(c.conselheiro, corpo(c.unidade.id)).expect(204)
    expect(emailFalso(app).enviadas).toHaveLength(2)
    expect(await pedidosDaUnidade(c.clube.id, c.unidade.id)).toHaveLength(2)
  })

  it('o limite de 24 h e por unidade: outra unidade do mesmo conselheiro envia', async () => {
    const c = await cenario()
    const segunda = await criarUnidade({ clubeId: c.clube.id })
    const conselheiro = await criarAcesso({ clubeId: c.clube.id, papel: 'CONSELHEIRO', unidadeIds: [c.unidade.id, segunda.id] })
    await pedir(conselheiro, corpo(c.unidade.id)).expect(204)
    emailFalso(app).limpar()
    await pedir(conselheiro, corpo(segunda.id)).expect(204)
    expect(emailFalso(app).enviadas).toHaveLength(2)
  })

  it('unidade que ja tem DBV (ativo, membro atual): 422 e nada enviado nem gravado', async () => {
    const c = await cenario()
    const dbv = await criarDbv({ clubeId: c.clube.id })
    await criarMembro({ dbvId: dbv.id, unidadeId: c.unidade.id, inicio: '2026-02-01' })
    const resposta = await pedir(c.conselheiro, corpo(c.unidade.id))
    expect(resposta.status).toBe(422)
    expect(resposta.body).toEqual({ codigo: 'REGRA', mensagem: 'A unidade já tem desbravadores.' })
    expect(emailFalso(app).enviadas).toHaveLength(0)
    expect(await pedidosDaUnidade(c.clube.id, c.unidade.id)).toHaveLength(0)
  })

  it('quem saiu da unidade, DBV inativo e lider nao contam como "tem DBV"', async () => {
    const c = await cenario()
    const ex = await criarDbv({ clubeId: c.clube.id })
    await criarMembro({ dbvId: ex.id, unidadeId: c.unidade.id, inicio: '2026-02-01', fim: '2026-06-01' })
    const inativo = await criarDbv({ clubeId: c.clube.id, ativo: false })
    await criarMembro({ dbvId: inativo.id, unidadeId: c.unidade.id, inicio: '2026-02-01' })
    const lider = await criarDbv({ clubeId: c.clube.id, tipo: 'LIDER' })
    await criarMembro({ dbvId: lider.id, unidadeId: c.unidade.id, inicio: '2026-02-01' })
    expect((await pedir(c.conselheiro, corpo(c.unidade.id))).status).toBe(204)
    expect(emailFalso(app).enviadas).toHaveLength(2)
  })

  it('clube sem Adm ativo: 204 e o pedido fica gravado', async () => {
    const clube = await criarClube()
    const unidade = await criarUnidade({ clubeId: clube.id })
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
    expect((await pedir(conselheiro, corpo(unidade.id))).status).toBe(204)
    expect(emailFalso(app).enviadas).toHaveLength(0)
    expect(await pedidosDaUnidade(clube.id, unidade.id)).toHaveLength(1)
  })

  it('Adm 403; instrutor 403; conselheiro de outra unidade 404; unidade inexistente 404', async () => {
    const c = await cenario()
    const instrutor = await criarAcesso({ clubeId: c.clube.id, papel: 'INSTRUTOR' })
    const outra = await criarUnidade({ clubeId: c.clube.id })
    expect((await pedir(c.adm1, corpo(c.unidade.id))).status).toBe(403)
    expect((await pedir(instrutor, corpo(c.unidade.id))).status).toBe(403)
    const fora = await pedir(c.conselheiro, corpo(outra.id))
    expect(fora.status).toBe(404)
    expect(fora.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
    expect((await pedir(c.conselheiro, corpo(randomUUID()))).status).toBe(404)
    expect(emailFalso(app).enviadas).toHaveLength(0)
  })

  it('corpo invalido: 400; sem sessao: 401', async () => {
    const c = await cenario()
    expect((await pedir(c.conselheiro, { tipo: 'OUTRO', unidadeId: c.unidade.id })).status).toBe(400)
    expect((await pedir(c.conselheiro, { tipo: 'UNIDADE_SEM_DBV', unidadeId: 'x' })).status).toBe(400)
    expect((await pedir(c.conselheiro, {})).status).toBe(400)
    const semSessao = await request(app.getHttpServer() as Server).post('/api/pedidos-ao-adm').send(corpo(c.unidade.id))
    expect(semSessao.status).toBe(401)
  })
})
