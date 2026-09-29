import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type { Response } from 'express'
import request from 'supertest'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAlbum,
  criarArquivo,
  criarClube,
  criarFoto,
  criarUnidade,
  desconectarPrismaDeTeste,
} from '../../test/fabricas'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ArquivosController } from './arquivos.controller'
import { ARMAZENAMENTO, ArmazenamentoDisco, type Armazenamento } from './armazenamento'
import { ServicoArquivos } from './servico-arquivos'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9])
const MINIATURA = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

describe('arquivos: armazenamento em disco', () => {
  let raiz: string
  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'armazenamento-'))
  })
  afterEach(() => rm(raiz, { recursive: true, force: true }))

  it('grava, abre e remove; remover o que nao existe nao falha', async () => {
    const disco = new ArmazenamentoDisco(raiz)
    await disco.gravar('clube/x/fotos/2026/a.jpg', JPEG)
    const pedacos: Buffer[] = []
    for await (const pedaco of disco.abrir('clube/x/fotos/2026/a.jpg')) pedacos.push(pedaco as Buffer)
    expect(Buffer.concat(pedacos)).toEqual(JPEG)
    await disco.remover('clube/x/fotos/2026/a.jpg')
    expect(() => disco.abrir('clube/x/fotos/2026/a.jpg')).toThrow()
    await expect(disco.remover('clube/x/fotos/2026/a.jpg')).resolves.toBeUndefined()
  })

  it('recusa caminho que escapa da raiz', async () => {
    const disco = new ArmazenamentoDisco(raiz)
    await expect(disco.gravar('../fora.jpg', JPEG)).rejects.toThrow()
    expect(() => disco.abrir('../../etc/passwd')).toThrow()
  })
})

describe('GET /api/arquivos/:id (URL assinada)', () => {
  let app: INestApplication
  let armazenamento: Armazenamento
  let servico: ServicoArquivos
  const prisma = new PrismaService()

  beforeAll(async () => {
    app = await criarAppDeTeste()
    armazenamento = app.get<Armazenamento>(ARMAZENAMENTO)
    servico = app.get(ServicoArquivos)
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
    await desconectarPrismaDeTeste()
  })

  const pedir = (url: string): request.Test => request(app.getHttpServer() as Server).get(url)

  async function fotoComArquivo(removida = false) {
    const clube = await criarClube()
    const unidade = await criarUnidade({ clubeId: clube.id })
    const album = await criarAlbum({ unidadeId: unidade.id, data: '2026-09-20' })
    const foto = await criarFoto({ albumId: album.id, removida })
    const arquivo = await prisma.arquivo.findFirstOrThrow({ where: { clubeId: clube.id, id: foto.arquivoId } })
    await armazenamento.gravar(arquivo.caminho, JPEG)
    if (arquivo.miniaturaCaminho) await armazenamento.gravar(arquivo.miniaturaCaminho, MINIATURA)
    return { clube, arquivo }
  }

  it('URL valida serve o JPEG, sem cache; miniatura serve a miniatura', async () => {
    const { clube, arquivo } = await fotoComArquivo()
    const original = await pedir(servico.urlAssinada(clube.id, arquivo.id, 'original')).buffer(true)
    expect(original.status).toBe(200)
    expect(original.headers['content-type']).toContain('image/jpeg')
    expect(original.headers['cache-control']).toBe('no-store')
    expect(original.body).toEqual(JPEG)
    const miniatura = await pedir(servico.urlAssinada(clube.id, arquivo.id, 'miniatura')).buffer(true)
    expect(miniatura.body).toEqual(MINIATURA)
  })

  it('a URL nao carrega o caminho do arquivo', async () => {
    const { clube, arquivo } = await fotoComArquivo()
    const url = servico.urlAssinada(clube.id, arquivo.id, 'original')
    expect(url).toMatch(/^\/api\/arquivos\/[0-9a-f-]{36}\?c=[0-9a-f-]{36}&v=original&exp=\d+&sig=[A-Za-z0-9_-]{43}$/)
    expect(url).not.toContain('fotos/')
  })

  it('vencida: 403', async () => {
    const { clube, arquivo } = await fotoComArquivo()
    const url = servico.urlAssinada(clube.id, arquivo.id, 'original', new Date(Date.now() - 11 * 60_000))
    expect((await pedir(url)).status).toBe(403)
  })

  it('validade maior que 10 minutos: 403, mesmo com assinatura correta', async () => {
    const { clube, arquivo } = await fotoComArquivo()
    const url = servico.urlAssinada(clube.id, arquivo.id, 'original', new Date(Date.now() + 5 * 60_000))
    expect((await pedir(url)).status).toBe(403)
  })

  it('assinatura adulterada, variante trocada ou id de outro arquivo: 403', async () => {
    const { clube, arquivo } = await fotoComArquivo()
    const outro = await fotoComArquivo()
    const url = servico.urlAssinada(clube.id, arquivo.id, 'original')
    const adulterada = url.replace(/sig=(.)/, (_t, primeira: string) => `sig=${primeira === 'A' ? 'B' : 'A'}`)
    expect((await pedir(adulterada)).status).toBe(403)
    expect((await pedir(url.replace('v=original', 'v=miniatura'))).status).toBe(403)
    expect((await pedir(url.replace(arquivo.id, outro.arquivo.id))).status).toBe(403)
  })

  it('id, variante, validade ou assinatura malformados: 403 sem consultar o banco', async () => {
    const findFirst = jest.fn()
    const controlador = new ArquivosController({ arquivo: { findFirst } } as unknown as PrismaService, servico, armazenamento)
    const resposta = { setHeader: jest.fn() } as unknown as Response
    const { clube, arquivo } = await fotoComArquivo()
    const valida = { c: clube.id, v: 'original', exp: String(Math.floor(Date.now() / 1000) + 300), sig: 'x'.repeat(43) }
    const malformados: [string, Record<string, unknown>][] = [
      ['nao-e-um-id', valida],
      [arquivo.id, { ...valida, v: 'grande' }],
      [arquivo.id, { ...valida, exp: 'abc' }],
      [arquivo.id, { ...valida, sig: 'curta' }],
      [arquivo.id, { ...valida, c: 'nao-e-um-id' }],
      [arquivo.id, { v: 'original' }],
      [arquivo.id, valida],
    ]
    for (const [id, consulta] of malformados) {
      await expect(controlador.servir(id, consulta, resposta)).rejects.toMatchObject({ codigo: 'SEM_PERMISSAO' })
    }
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('foto removida: 404', async () => {
    const { clube, arquivo } = await fotoComArquivo(true)
    expect((await pedir(servico.urlAssinada(clube.id, arquivo.id, 'original'))).status).toBe(404)
  })

  it('arquivo inexistente ou de outro clube: 404', async () => {
    const { arquivo } = await fotoComArquivo()
    const outroClube = await criarClube()
    expect((await pedir(servico.urlAssinada(outroClube.id, arquivo.id, 'original'))).status).toBe(404)
    expect((await pedir(servico.urlAssinada(outroClube.id, randomUUID(), 'original'))).status).toBe(404)
  })

  it('arquivo no banco mas sem bytes no disco: 404', async () => {
    const clube = await criarClube()
    const arquivo = await criarArquivo({ clubeId: clube.id })
    expect((await pedir(servico.urlAssinada(clube.id, arquivo.id, 'original'))).status).toBe(404)
  })
})
