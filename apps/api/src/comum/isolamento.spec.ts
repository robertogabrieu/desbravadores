import type { INestApplication } from '@nestjs/common'
import { criarAppDeTeste } from '../../test/app'
import { criarUnidade, desconectarPrismaDeTeste, prismaDeTeste } from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { RotasDeTesteModule } from '../../test/rotas-de-teste'

describe('auxiliar testarIsolamento (usado por P5 e P6)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await criarAppDeTeste({ extras: [RotasDeTesteModule] })
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  testarIsolamento({
    titulo: 'GET /_teste/unidades/:id',
    app: () => app,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      return { metodo: 'get', caminho: `/api/_teste/unidades/${unidade.id}` }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'PATCH /_teste/unidades/:id',
    app: () => app,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id, nome: 'Original' })
      return {
        metodo: 'patch',
        caminho: `/api/_teste/unidades/${unidade.id}`,
        corpo: { nome: 'Invadida' },
        conferirIntacto: async () => {
          const depois = await prismaDeTeste().unidade.findUniqueOrThrow({ where: { id: unidade.id } })
          expect(depois.nome).toBe('Original')
        },
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'GET /_teste/unidades (lista)',
    app: () => app,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      return { metodo: 'get', caminho: '/api/_teste/unidades', idsDoOutroClube: [unidade.id] }
    },
    esperado: { tipo: 'LISTA_SEM_OS_IDS' },
  })
})
