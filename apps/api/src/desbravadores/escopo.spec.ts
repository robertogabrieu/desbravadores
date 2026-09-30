import type { INestApplication } from '@nestjs/common'
import type { StatusMatricula } from '../generated/prisma/client.js'
import { criarAppDeTeste } from '../../test/app'
import { classeOficial, criarAcesso, criarClube, criarDbv, criarMatricula, desconectarPrismaDeTeste, prismaDeTeste } from '../../test/fabricas'
import { anoCorrente, clienteHttp } from '../../test/p6'

describe('escopo do instrutor olha o status da matricula (B11)', () => {
  let app: INestApplication
  const http = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })
  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  async function cenarioComStatus(status: StatusMatricula) {
    const clube = await criarClube()
    const amigo = await classeOficial('Amigo')
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
    const dbv = await criarDbv({ clubeId: clube.id })
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente(), status })
    return { clube, instrutor, dbv }
  }

  it.each<StatusMatricula>(['CURSANDO', 'CONCLUIDA', 'INVESTIDA'])('matricula %s: o instrutor ve o perfil e a lista', async (status) => {
    const { instrutor, dbv } = await cenarioComStatus(status)
    expect((await http.get(`/api/desbravadores/${dbv.id}/perfil`, instrutor.autorizacao)).status).toBe(200)
    const lista = await http.get('/api/desbravadores', instrutor.autorizacao)
    expect(JSON.stringify(lista.body)).toContain(dbv.id)
  })

  it('matricula DESISTIU: some do perfil (404) e da lista do instrutor', async () => {
    const { instrutor, dbv } = await cenarioComStatus('DESISTIU')
    expect((await http.get(`/api/desbravadores/${dbv.id}/perfil`, instrutor.autorizacao)).status).toBe(404)
    const lista = await http.get('/api/desbravadores', instrutor.autorizacao)
    expect(lista.status).toBe(200)
    expect(JSON.stringify(lista.body)).not.toContain(dbv.id)
  })

  it('o Adm continua vendo quem desistiu', async () => {
    const { clube, dbv } = await cenarioComStatus('DESISTIU')
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    expect((await http.get(`/api/desbravadores/${dbv.id}/perfil`, adm.autorizacao)).status).toBe(200)
  })

  it('DESISTIU numa classe e CURSANDO em outra do mesmo instrutor: continua visivel', async () => {
    const { clube, instrutor, dbv } = await cenarioComStatus('DESISTIU')
    const companheiro = await classeOficial('Companheiro')
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: companheiro.id, anoClube: anoCorrente(), status: 'CURSANDO' })
    await prismaDeTeste().vinculoClasse.create({ data: { vinculoId: instrutor.vinculo.id, classeId: companheiro.id } })
    expect((await http.get(`/api/desbravadores/${dbv.id}/perfil`, instrutor.autorizacao)).status).toBe(200)
  })
})
