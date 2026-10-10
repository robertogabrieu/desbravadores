import type { INestApplication } from '@nestjs/common'
import { GATILHOS_CB, type PontosCBSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarClube,
  criarDbv,
  criarLancamento,
  criterioPorGatilho,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'

type Pontos = z.infer<typeof PontosCBSaida>

const ROTA = '/api/classe-biblica/pontos'

describe('classe bíblica: pontos', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  it('GET em clube sem critério cria os dois, com 10 e 5 ativos', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })

    const saida = corpo<Pontos>(await api.get(ROTA, adm.autorizacao).expect(200))

    expect(saida.itens).toEqual([
      { gatilho: 'CLASSE_BIBLICA_PRESENCA', nome: 'Presença na Classe Bíblica', pontos: 10, ativo: true },
      { gatilho: 'CLASSE_BIBLICA_PARTICIPACAO', nome: 'Participou ativamente da Classe Bíblica', pontos: 5, ativo: true },
    ])
    const doGatilho = { clubeId: clube.id, gatilho: { in: [...GATILHOS_CB] } }
    expect(await prismaDeTeste().criterioRanking.count({ where: doGatilho })).toBe(2)
    await api.get(ROTA, adm.autorizacao).expect(200)
    expect(await prismaDeTeste().criterioRanking.count({ where: doGatilho })).toBe(2)
  })

  it('PATCH muda pontos e ativo; os lançamentos antigos ficam como estavam', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    await api.get(ROTA, adm.autorizacao).expect(200)
    const presenca = await criterioPorGatilho(clube.id, 'CLASSE_BIBLICA_PRESENCA')
    const dbv = await criarDbv({ clubeId: clube.id })
    const antigo = await criarLancamento({
      clubeId: clube.id, dbvId: dbv.id, pontos: 10, data: '2026-09-06', criterioId: presenca.id, origemTipo: 'CLASSE_BIBLICA',
    })

    const saida = corpo<Pontos>(
      await api
        .patch(ROTA, adm.autorizacao, {
          itens: [
            { gatilho: 'CLASSE_BIBLICA_PRESENCA', pontos: 8, ativo: true },
            { gatilho: 'CLASSE_BIBLICA_PARTICIPACAO', pontos: 5, ativo: false },
          ],
        })
        .expect(200),
    )

    expect(saida.itens).toEqual([
      { gatilho: 'CLASSE_BIBLICA_PRESENCA', nome: 'Presença na Classe Bíblica', pontos: 8, ativo: true },
      { gatilho: 'CLASSE_BIBLICA_PARTICIPACAO', nome: 'Participou ativamente da Classe Bíblica', pontos: 5, ativo: false },
    ])
    const lancamento = await prismaDeTeste().lancamentoPontos.findUniqueOrThrow({ where: { id: antigo.id } })
    expect(lancamento.pontos).toBe(10)
    expect(lancamento.estornadoEm).toBeNull()
  })

  it('PATCH com um item só muda só aquele critério', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })

    const saida = corpo<Pontos>(
      await api.patch(ROTA, adm.autorizacao, { itens: [{ gatilho: 'CLASSE_BIBLICA_PARTICIPACAO', pontos: 3, ativo: true }] }).expect(200),
    )

    expect(saida.itens.map((item) => item.pontos)).toEqual([10, 3])
  })

  it('PATCH só altera os critérios do próprio clube', async () => {
    const outro = await criarClube()
    const admOutro = await criarAcesso({ clubeId: outro.id, papel: 'ADM' })
    await api.get(ROTA, admOutro.autorizacao).expect(200)
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })

    await api.patch(ROTA, adm.autorizacao, { itens: [{ gatilho: 'CLASSE_BIBLICA_PRESENCA', pontos: 1, ativo: false }] }).expect(200)

    expect(await criterioPorGatilho(outro.id, 'CLASSE_BIBLICA_PRESENCA')).toMatchObject({ pontos: 10, ativo: true })
  })

  it('recusa entrada inválida', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })

    await api.patch(ROTA, adm.autorizacao, { itens: [{ gatilho: 'CLASSE_BIBLICA_PRESENCA', pontos: -1, ativo: true }] }).expect(400)
    await api.patch(ROTA, adm.autorizacao, { itens: [] }).expect(400)
  })

  it('sem ranking.configurar responde 403 no GET e no PATCH', async () => {
    const clube = await criarClube()
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })

    await api.get(ROTA, conselheiro.autorizacao).expect(403)
    await api.patch(ROTA, conselheiro.autorizacao, { itens: [{ gatilho: 'CLASSE_BIBLICA_PRESENCA', pontos: 1, ativo: true }] }).expect(403)
  })
})
