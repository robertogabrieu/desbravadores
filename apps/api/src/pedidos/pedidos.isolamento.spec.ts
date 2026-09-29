import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { criarAppDeTeste, emailFalso } from '../../test/app'
import { criarAcesso, criarClube, criarUnidade, desconectarPrismaDeTeste, prismaDeTeste } from '../../test/fabricas'

// O helper padrao de isolamento usa um Adm no clube B, e o Adm recebe 403 nesta rota; por isso o
// controle aqui e o proprio conselheiro do clube B.
describe('isolamento entre clubes: POST /pedidos-ao-adm', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  it('conselheiro do clube A pedindo pela unidade do clube B: 404, sem pedido e sem e-mail; o dono do clube B consegue', async () => {
    const clubeA = await criarClube()
    const clubeB = await criarClube()
    const unidadeB = await criarUnidade({ clubeId: clubeB.id })
    const conselheiroA = await criarAcesso({ clubeId: clubeA.id, papel: 'CONSELHEIRO' })
    const conselheiroB = await criarAcesso({ clubeId: clubeB.id, papel: 'CONSELHEIRO', unidadeIds: [unidadeB.id] })
    await criarAcesso({ clubeId: clubeB.id, papel: 'ADM' })
    emailFalso(app).limpar()
    const servidor = app.getHttpServer() as Server
    const corpo = { tipo: 'UNIDADE_SEM_DBV', unidadeId: unidadeB.id }

    const negado = await request(servidor).post('/api/pedidos-ao-adm').set('Authorization', conselheiroA.autorizacao).send(corpo)
    expect(negado.status).toBe(404)
    expect(negado.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
    expect(await prismaDeTeste().pedidoAoAdm.count({ where: { clubeId: clubeB.id } })).toBe(0)
    expect(emailFalso(app).enviadas).toHaveLength(0)

    const controle = await request(servidor).post('/api/pedidos-ao-adm').set('Authorization', conselheiroB.autorizacao).send(corpo)
    expect(controle.status).toBe(204)
    expect(await prismaDeTeste().pedidoAoAdm.count({ where: { clubeId: clubeB.id } })).toBe(1)
  })
})
