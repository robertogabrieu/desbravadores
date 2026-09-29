import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { hojeNoFuso } from '@desbravadores/shared'
import { criarAppDeTeste } from '../../test/app'
import {
  chamadasDaReuniao,
  criarDbv,
  criarMembro,
  criarReuniao,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'

const hoje = (): string => hojeNoFuso('America/Sao_Paulo', new Date())

describe('isolamento entre clubes: rotas de reunioes', () => {
  let app: INestApplication
  const doApp = (): INestApplication => app

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  testarIsolamento({
    titulo: 'PUT /sync/reunioes/:uuid com unidade de outro clube',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      const dbv = await criarDbv({ clubeId: clube.id })
      await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-01-01' })
      const uuid = randomUUID()
      return {
        metodo: 'put',
        caminho: `/api/sync/reunioes/${uuid}`,
        corpo: {
          versaoPayload: 1, envioId: randomUUID(), unidadeId: unidade.id, data: hoje(), feitaNoAparelhoEm: new Date().toISOString(),
          cabecalho: { horario: '09:00', local: null, observacoes: null, versaoVista: null },
          linhas: [{ dbvId: dbv.id, situacao: 'PRESENTE', uniforme: false, biblia: false, licao: false, versaoVista: null }],
        },
        conferirIntacto: async () => {
          expect(await prismaDeTeste().reuniao.count({ where: { clubeId: clube.id } })).toBe(0)
        },
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'GET /reunioes?unidadeId',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      await criarReuniao({ unidadeId: unidade.id, data: hoje() })
      return { metodo: 'get', caminho: `/api/reunioes?unidadeId=${unidade.id}&mes=${hoje().slice(0, 7)}` }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'GET /reunioes/:id',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      const reuniao = await criarReuniao({ unidadeId: unidade.id, data: hoje() })
      return { metodo: 'get', caminho: `/api/reunioes/${reuniao.id}` }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'GET /unidades/:id/frequencia',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      return { metodo: 'get', caminho: `/api/unidades/${unidade.id}/frequencia` }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'GET /unidades/:id/membros (frequencia)',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      const dbv = await criarDbv({ clubeId: clube.id })
      await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-01-01' })
      const reuniao = await criarReuniao({ unidadeId: unidade.id, data: hoje(), chamada: [{ dbvId: dbv.id }] })
      return {
        metodo: 'get',
        caminho: `/api/unidades/${unidade.id}/membros`,
        conferirIntacto: async () => {
          expect((await chamadasDaReuniao(reuniao.id)).length).toBe(1)
        },
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })
})
