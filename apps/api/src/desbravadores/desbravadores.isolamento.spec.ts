import type { INestApplication } from '@nestjs/common'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  criarDbv,
  criarUnidade,
  criarUsuario,
  criarVinculo,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { anoCorrente, criarClasseDoClube, hoje, nascimentoComIdade } from '../../test/p6'

describe('isolamento entre clubes: rotas de desbravadores', () => {
  let app: INestApplication
  const doApp = (): INestApplication => app

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  const dbvIntacto = (id: string, nome: string) => async (): Promise<void> => {
    const depois = await prismaDeTeste().desbravador.findUniqueOrThrow({ where: { id } })
    expect(depois.nome).toBe(nome)
  }

  testarIsolamento({
    titulo: 'GET /desbravadores (lista)',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const dbv = await criarDbv({ clubeId: clube.id })
      return { metodo: 'get', caminho: '/api/desbravadores', idsDoOutroClube: [dbv.id] }
    },
    esperado: { tipo: 'LISTA_SEM_OS_IDS' },
  })

  testarIsolamento({
    titulo: 'GET /desbravadores/:id',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const dbv = await criarDbv({ clubeId: clube.id })
      return { metodo: 'get', caminho: `/api/desbravadores/${dbv.id}` }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'POST /desbravadores com unidadeId de outro clube',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      return {
        metodo: 'post',
        caminho: '/api/desbravadores',
        corpo: { nome: 'Novo Dbv', sexo: 'M', nascimento: nascimentoComIdade(10), entradaEm: '2026-02-01', unidadeId: unidade.id },
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'POST /desbravadores com classeId de outro clube',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const classe = await criarClasseDoClube(clube.id)
      return {
        metodo: 'post',
        caminho: '/api/desbravadores',
        corpo: { nome: 'Novo Dbv', sexo: 'M', nascimento: nascimentoComIdade(10), entradaEm: '2026-02-01', classeId: classe.id },
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'POST /desbravadores com usuarioId do LIDER de outro clube',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const usuario = await criarUsuario()
      await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      return {
        metodo: 'post',
        caminho: '/api/desbravadores',
        corpo: { nome: 'Novo Lider', sexo: 'M', nascimento: '1990-01-01', entradaEm: '2026-02-01', tipo: 'LIDER', usuarioId: usuario.id },
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'PATCH /desbravadores/:id',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const dbv = await criarDbv({ clubeId: clube.id, nome: 'Original' })
      return {
        metodo: 'patch',
        caminho: `/api/desbravadores/${dbv.id}`,
        corpo: { nome: 'Invadido' },
        conferirIntacto: dbvIntacto(dbv.id, 'Original'),
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'POST /desbravadores/:id/inativar',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const dbv = await criarDbv({ clubeId: clube.id })
      return {
        metodo: 'post',
        caminho: `/api/desbravadores/${dbv.id}/inativar`,
        corpo: { saidaEm: '2026-08-10' },
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'POST /desbravadores/:id/reativar',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const dbv = await criarDbv({ clubeId: clube.id, ativo: false })
      return {
        metodo: 'post',
        caminho: `/api/desbravadores/${dbv.id}/reativar`,
        conferirIntacto: async () => {
          const depois = await prismaDeTeste().desbravador.findUniqueOrThrow({ where: { id: dbv.id } })
          expect(depois.ativo).toBe(false)
        },
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'PUT /desbravadores/:id/unidade',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const dbv = await criarDbv({ clubeId: clube.id })
      const unidade = await criarUnidade({ clubeId: clube.id })
      return {
        metodo: 'put',
        caminho: `/api/desbravadores/${dbv.id}/unidade`,
        corpo: { unidadeId: unidade.id, desde: hoje() },
        conferirIntacto: async () => {
          expect(await prismaDeTeste().membroUnidade.count({ where: { clubeId: clube.id, dbvId: dbv.id } })).toBe(0)
        },
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'POST /desbravadores/:id/matriculas',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const dbv = await criarDbv({ clubeId: clube.id })
      const amigo = await classeOficial('Amigo')
      return {
        metodo: 'post',
        caminho: `/api/desbravadores/${dbv.id}/matriculas`,
        corpo: { classeId: amigo.id, anoClube: anoCorrente() },
        conferirIntacto: async () => {
          expect(await prismaDeTeste().matriculaClasse.count({ where: { clubeId: clube.id, dbvId: dbv.id } })).toBe(0)
        },
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })
})
