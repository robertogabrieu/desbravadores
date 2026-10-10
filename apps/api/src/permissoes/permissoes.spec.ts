import type { INestApplication } from '@nestjs/common'
import { CATALOGO_PERMISSOES } from '@desbravadores/shared'
import { criarAppDeTeste } from '../../test/app'
import { criarAcesso, criarClube, desconectarPrismaDeTeste } from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'

describe('GET /permissoes/catalogo', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  it('devolve as 23 chaves do catalogo com rotulo e padrao por papel', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const catalogo = corpo<{ chave: string; rotulo: string; padrao: object }[]>(
      await api.get('/api/permissoes/catalogo', adm.autorizacao).expect(200),
    )
    expect(catalogo).toHaveLength(23)
    expect(catalogo.map((c) => c.chave)).toEqual(Object.keys(CATALOGO_PERMISSOES))
    expect(catalogo.find((c) => c.chave === 'dbv.editar')).toEqual({
      chave: 'dbv.editar',
      rotulo: 'Editar dados dos DBVs da unidade',
      padrao: { ADM: true, CONSELHEIRO: false },
    })
  })

  it('exige usuario.gerenciar: conselheiro e instrutor → 403; sem token → 401', async () => {
    const clube = await criarClube()
    const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
    await api.get('/api/permissoes/catalogo', cons.autorizacao).expect(403)
    await api.get('/api/permissoes/catalogo', instrutor.autorizacao).expect(403)
    await api.get('/api/permissoes/catalogo', '').expect(401)
  })
})
