import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import sharp from 'sharp'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAlbum,
  criarFoto,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'

describe('isolamento entre clubes: rotas de fotos', () => {
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
    titulo: 'GET /albuns?unidadeId',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      const album = await criarAlbum({ unidadeId: unidade.id, data: '2026-09-20' })
      await criarFoto({ albumId: album.id })
      return { metodo: 'get', caminho: `/api/albuns?unidadeId=${unidade.id}`, idsDoOutroClube: [album.id] }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'GET /albuns/:id',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      const album = await criarAlbum({ unidadeId: unidade.id, data: '2026-09-20' })
      await criarFoto({ albumId: album.id })
      return { metodo: 'get', caminho: `/api/albuns/${album.id}` }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'DELETE /fotos/:id',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      const album = await criarAlbum({ unidadeId: unidade.id, data: '2026-09-20' })
      const foto = await criarFoto({ albumId: album.id })
      // O controle (dono do clube) tambem remove: o teste do clube A roda primeiro e nao pode ter mexido.
      return {
        metodo: 'delete',
        caminho: `/api/fotos/${foto.id}`,
        conferirIntacto: async () => {
          const depois = await prismaDeTeste().foto.findFirstOrThrow({ where: { clubeId: clube.id, id: foto.id } })
          expect(depois.removidaEm).toBeNull()
        },
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'GET /unidades/:id/sem-autorizacao-imagem',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      return { metodo: 'get', caminho: `/api/unidades/${unidade.id}/sem-autorizacao-imagem` }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'PUT /sync/fotos/:uuid (multipart, album EXISTENTE do outro clube)',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      const album = await criarAlbum({ unidadeId: unidade.id, data: '2026-09-20' })
      const fotoId = randomUUID()
      const imagem = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#fff' } }).jpeg().toBuffer()
      return {
        metodo: 'put',
        caminho: `/api/sync/fotos/${fotoId}`,
        anexos: {
          campos: { dados: JSON.stringify({ versaoPayload: 1, album: { tipo: 'EXISTENTE', id: album.id }, legenda: null }) },
          arquivos: [{ campo: 'arquivo', conteudo: imagem, nome: 'foto.jpg', tipo: 'image/jpeg' }],
        },
        conferirIntacto: async () => {
          expect(await prismaDeTeste().foto.count({ where: { clubeId: clube.id, albumId: album.id } })).toBe(0)
        },
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })

  testarIsolamento({
    titulo: 'PUT /sync/fotos/:uuid (multipart, album NOVO em unidade do outro clube)',
    app: doApp,
    papel: 'ADM',
    semear: async (clube) => {
      const unidade = await criarUnidade({ clubeId: clube.id })
      const albumId = randomUUID()
      const imagem = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#fff' } }).jpeg().toBuffer()
      return {
        metodo: 'put',
        caminho: `/api/sync/fotos/${randomUUID()}`,
        anexos: {
          campos: {
            dados: JSON.stringify({
              versaoPayload: 1,
              album: { tipo: 'NOVO', id: albumId, unidadeId: unidade.id, titulo: 'X', data: '2026-09-20' },
              legenda: null,
            }),
          },
          arquivos: [{ campo: 'arquivo', conteudo: imagem, nome: 'foto.jpg', tipo: 'image/jpeg' }],
        },
        conferirIntacto: async () => {
          expect(await prismaDeTeste().album.count({ where: { clubeId: clube.id, unidadeId: unidade.id } })).toBe(0)
        },
      }
    },
    esperado: { tipo: 'NAO_ENCONTRADO' },
  })
})
