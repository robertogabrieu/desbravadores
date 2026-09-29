import type { INestApplication } from '@nestjs/common'
import { criarAppDeTeste } from '../../test/app'
import { criarDbv, criarLancamento, criarMembro, criarUnidade, desconectarPrismaDeTeste } from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { hoje } from '../../test/p6'

describe('isolamento entre clubes: perfil, ranking e ranking das unidades', () => {
  let app: INestApplication
  const doApp = (): INestApplication => app

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  for (const papel of ['ADM', 'CONSELHEIRO', 'INSTRUTOR'] as const) {
    testarIsolamento({
      titulo: `GET /desbravadores/:id/perfil (${papel})`,
      app: doApp,
      papel,
      semear: async (clube) => {
        const dbv = await criarDbv({ clubeId: clube.id })
        return { metodo: 'get', caminho: `/api/desbravadores/${dbv.id}/perfil` }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })
  }

  testarIsolamento({
    titulo: 'GET /ranking',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      const dbv = await criarDbv({ clubeId: clube.id })
      await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-01-01' })
      await criarLancamento({ clubeId: clube.id, dbvId: dbv.id, pontos: 10, data: hoje() })
      return { metodo: 'get', caminho: '/api/ranking', idsDoOutroClube: [dbv.id, unidade.id] }
    },
    esperado: { tipo: 'LISTA_SEM_OS_IDS' },
  })

  testarIsolamento({
    titulo: 'GET /ranking?unidadeId de outro clube',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      return { metodo: 'get', caminho: `/api/ranking?unidadeId=${unidade.id}` }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'GET /ranking/unidades',
    app: doApp,
    papel: 'INSTRUTOR',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      const dbv = await criarDbv({ clubeId: clube.id })
      await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-01-01' })
      return { metodo: 'get', caminho: '/api/ranking/unidades', idsDoOutroClube: [unidade.id] }
    },
    esperado: { tipo: 'LISTA_SEM_OS_IDS' },
  })
})
