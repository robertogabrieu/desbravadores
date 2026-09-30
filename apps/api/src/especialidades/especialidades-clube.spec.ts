import type { INestApplication } from '@nestjs/common'
import type { AreaComEspecialidades } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import { criarAcesso, criarClube, desconectarPrismaDeTeste, prismaDeTeste } from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'

type Areas = z.infer<typeof AreaComEspecialidades>[]

describe('A5: especialidade do clube', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  it('POST /especialidades cria com origem CLUBE e o GET /especialidades ja lista', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const admOutro = await criarAcesso({ clubeId: outro.id, papel: 'ADM' })
    const area = await prismaDeTeste().areaEspecialidade.findFirstOrThrow()

    const saida = corpo<Areas>(await api.post('/api/especialidades', adm.autorizacao, { areaId: area.id, nome: 'Nos e amarras do clube' }).expect(201))
    const criada = saida.find((a) => a.id === area.id)?.especialidades.find((e) => e.nome === 'Nos e amarras do clube')
    expect(criada).toMatchObject({ origem: 'CLUBE' })

    const noBanco = await prismaDeTeste().especialidade.findUniqueOrThrow({ where: { id: criada!.id } })
    expect(noBanco).toMatchObject({ clubeId: clube.id, origem: 'CLUBE', areaId: area.id, ativa: true })

    const lista = corpo<Areas>(await api.get('/api/especialidades', adm.autorizacao).expect(200))
    expect(JSON.stringify(lista)).toContain(criada!.id)
    const listaOutro = corpo<Areas>(await api.get('/api/especialidades', admOutro.autorizacao).expect(200))
    expect(JSON.stringify(listaOutro)).not.toContain(criada!.id)
  })

  it('nome repetido na mesma area → 409; em outro clube ou outra area passa', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const admOutro = await criarAcesso({ clubeId: outro.id, papel: 'ADM' })
    const [area, outraArea] = await prismaDeTeste().areaEspecialidade.findMany({ orderBy: { ordem: 'asc' }, take: 2 })

    await api.post('/api/especialidades', adm.autorizacao, { areaId: area.id, nome: 'Unica' }).expect(201)
    const repetida = await api.post('/api/especialidades', adm.autorizacao, { areaId: area.id, nome: '  Unica ' }).expect(409)
    expect(repetida.body).toMatchObject({ codigo: 'CONFLITO' })
    await api.post('/api/especialidades', adm.autorizacao, { areaId: outraArea.id, nome: 'Unica' }).expect(201)
    await api.post('/api/especialidades', admOutro.autorizacao, { areaId: area.id, nome: 'Unica' }).expect(201)
  })

  it('nome igual ao de uma oficial da area → 409', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const oficial = await prismaDeTeste().especialidade.findFirstOrThrow({ where: { clubeId: null } })
    await api.post('/api/especialidades', adm.autorizacao, { areaId: oficial.areaId, nome: oficial.nome }).expect(409)
  })

  it('area inexistente → 404; corpo invalido → 400; nao-Adm → 403', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
    const area = await prismaDeTeste().areaEspecialidade.findFirstOrThrow()
    await api.post('/api/especialidades', adm.autorizacao, { areaId: '019d0000-0000-7000-8000-000000000000', nome: 'X' }).expect(404)
    await api.post('/api/especialidades', adm.autorizacao, { areaId: area.id }).expect(400)
    await api.post('/api/especialidades', instrutor.autorizacao, { areaId: area.id, nome: 'X' }).expect(403)
  })

  it('duas criacoes simultaneas do mesmo nome na mesma area: uma 201 e uma 409', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const area = await prismaDeTeste().areaEspecialidade.findFirstOrThrow()
    const criar = () => api.post('/api/especialidades', adm.autorizacao, { areaId: area.id, nome: 'Corrida de nomes' })
    const respostas = await Promise.all([criar(), criar()])
    expect(respostas.map((r) => r.status).sort()).toEqual([201, 409])
    expect(await prismaDeTeste().especialidade.count({ where: { clubeId: clube.id, areaId: area.id } })).toBe(1)
  })
})
