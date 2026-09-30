import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { Logger, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import sharp from 'sharp'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarAlbum,
  criarClube,
  criarDbv,
  criarFoto,
  criarMembro,
  criarReuniao,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  type Acesso,
} from '../../test/fabricas'
import { ARMAZENAMENTO, type Armazenamento } from '../arquivos/armazenamento'
import { PrismaService } from '../comum/prisma/prisma.service'
import { Prisma } from '../generated/prisma/client.js'
import { LimpezaDeFotos } from './limpeza-de-fotos'

const DOIS_MB = 2 * 1024 * 1024

async function jpeg(largura = 300, altura = 200): Promise<Buffer> {
  return sharp({ create: { width: largura, height: altura, channels: 3, background: '#3366cc' } })
    .jpeg()
    .toBuffer()
}

function existeNoDisco(armazenamento: Armazenamento, caminho: string): boolean {
  try {
    armazenamento.abrir(caminho).destroy()
    return true
  } catch {
    return false
  }
}

async function lerDoDisco(armazenamento: Armazenamento, caminho: string): Promise<Buffer> {
  const pedacos: Buffer[] = []
  for await (const pedaco of armazenamento.abrir(caminho)) pedacos.push(pedaco as Buffer)
  return Buffer.concat(pedacos)
}

describe('fotos: envio, galeria e remocao', () => {
  let app: INestApplication
  let armazenamento: Armazenamento

  beforeAll(async () => {
    app = await criarAppDeTeste()
    armazenamento = app.get<Armazenamento>(ARMAZENAMENTO)
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  afterEach(() => jest.restoreAllMocks())

  const servidor = (): Server => app.getHttpServer() as Server

  interface Cenario {
    clubeId: string
    unidadeId: string
    outraUnidadeId: string
    conselheiro: Acesso
    outroConselheiro: Acesso
    adm: Acesso
    instrutor: Acesso
  }

  async function cenario(): Promise<Cenario> {
    const clube = await criarClube()
    const unidade = await criarUnidade({ clubeId: clube.id })
    const outra = await criarUnidade({ clubeId: clube.id })
    return {
      clubeId: clube.id,
      unidadeId: unidade.id,
      outraUnidadeId: outra.id,
      conselheiro: await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] }),
      outroConselheiro: await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] }),
      adm: await criarAcesso({ clubeId: clube.id, papel: 'ADM' }),
      instrutor: await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' }),
    }
  }

  type AlbumDados =
    | { tipo: 'REUNIAO'; unidadeId: string; data: string }
    | { tipo: 'EXISTENTE'; id: string }
    | { tipo: 'NOVO'; id: string; unidadeId: string; titulo: string; data: string }

  function enviar(
    acesso: Acesso,
    fotoId: string,
    album: AlbumDados,
    arquivo: Buffer | null,
    opcoes: { legenda?: string | null; nomeArquivo?: string; tipoArquivo?: string } = {},
  ): request.Test {
    const req = request(servidor())
      .put(`/api/sync/fotos/${fotoId}`)
      .set('Authorization', acesso.autorizacao)
      .field('dados', JSON.stringify({ versaoPayload: 1, album, legenda: opcoes.legenda ?? null }))
    if (arquivo) {
      req.attach('arquivo', arquivo, {
        filename: opcoes.nomeArquivo ?? 'foto.jpg',
        contentType: opcoes.tipoArquivo ?? 'image/jpeg',
      })
    }
    return req
  }

  const novoAlbum = (unidadeId: string, id: string = randomUUID(), data = '2026-09-20'): AlbumDados => ({
    tipo: 'NOVO',
    id,
    unidadeId,
    titulo: 'Acampamento',
    data,
  })

  async function enviarNovaFoto(c: Cenario, acesso: Acesso = c.conselheiro, album?: AlbumDados) {
    const fotoId = randomUUID()
    const resposta = await enviar(acesso, fotoId, album ?? novoAlbum(c.unidadeId), await jpeg())
    expect(resposta.status).toBe(200)
    return { fotoId, albumId: (resposta.body as { albumId: string }).albumId }
  }

  describe('PUT /api/sync/fotos/:uuid', () => {
    it('album NOVO com id do aparelho: grava album, arquivo e foto; original reduzido e miniatura de 400 px', async () => {
      const c = await cenario()
      const albumId = randomUUID()
      const fotoId = randomUUID()
      const resposta = await enviar(c.conselheiro, fotoId, novoAlbum(c.unidadeId, albumId), await jpeg(3000, 1500), {
        legenda: 'Fogueira',
      })
      expect(resposta.status).toBe(200)
      expect(resposta.body).toEqual({ fotoId, albumId })

      const prisma = prismaDeTeste()
      const album = await prisma.album.findFirstOrThrow({ where: { clubeId: c.clubeId, id: albumId } })
      expect(album).toMatchObject({ unidadeId: c.unidadeId, titulo: 'Acampamento', reuniaoId: null, criadoPorId: c.conselheiro.usuario.id })
      expect(album.data.toISOString().slice(0, 10)).toBe('2026-09-20')

      const foto = await prisma.foto.findFirstOrThrow({ where: { clubeId: c.clubeId, id: fotoId } })
      expect(foto).toMatchObject({ albumId, legenda: 'Fogueira', enviadaPorId: c.conselheiro.usuario.id, removidaEm: null })

      const arquivo = await prisma.arquivo.findFirstOrThrow({ where: { clubeId: c.clubeId, id: foto.arquivoId } })
      expect(arquivo.mime).toBe('image/jpeg')
      expect(arquivo.caminho).toMatch(new RegExp(`^clube/${c.clubeId}/fotos/\\d{4}/${arquivo.id}\\.jpg$`))
      expect(arquivo.miniaturaCaminho).toMatch(new RegExp(`^clube/${c.clubeId}/fotos/\\d{4}/${arquivo.id}-min\\.jpg$`))

      const original = await lerDoDisco(armazenamento, arquivo.caminho)
      const metaOriginal = await sharp(original).metadata()
      expect(metaOriginal.format).toBe('jpeg')
      expect(Math.max(metaOriginal.width ?? 0, metaOriginal.height ?? 0)).toBe(1600)
      expect(arquivo).toMatchObject({ bytes: original.length, largura: metaOriginal.width, altura: metaOriginal.height })

      const miniatura = await sharp(await lerDoDisco(armazenamento, arquivo.miniaturaCaminho ?? '')).metadata()
      expect(miniatura.format).toBe('jpeg')
      expect(Math.max(miniatura.width ?? 0, miniatura.height ?? 0)).toBe(400)
    })

    it('foto menor que 1600 px nao e ampliada', async () => {
      const c = await cenario()
      const { fotoId } = await enviarNovaFoto(c)
      const foto = await prismaDeTeste().foto.findFirstOrThrow({ where: { clubeId: c.clubeId, id: fotoId }, include: { arquivo: true } })
      expect(foto.arquivo).toMatchObject({ largura: 300, altura: 200 })
    })

    it('idempotente: reenviar o mesmo id devolve a mesma resposta sem regravar', async () => {
      const c = await cenario()
      const albumId = randomUUID()
      const fotoId = randomUUID()
      const primeira = await enviar(c.conselheiro, fotoId, novoAlbum(c.unidadeId, albumId), await jpeg())
      const gravar = jest.spyOn(armazenamento, 'gravar')
      const segunda = await enviar(c.conselheiro, fotoId, novoAlbum(c.unidadeId, albumId), await jpeg())
      expect(segunda.status).toBe(200)
      expect(segunda.body).toEqual(primeira.body)
      expect(gravar).not.toHaveBeenCalled()
      expect(await prismaDeTeste().foto.count({ where: { clubeId: c.clubeId, albumId } })).toBe(1)
      expect(await prismaDeTeste().arquivo.count({ where: { clubeId: c.clubeId } })).toBe(1)
    })

    it('album NOVO que ja existe (mesma unidade) e reaproveitado', async () => {
      const c = await cenario()
      const albumId = randomUUID()
      await enviarNovaFoto(c, c.conselheiro, novoAlbum(c.unidadeId, albumId))
      await enviarNovaFoto(c, c.outroConselheiro, novoAlbum(c.unidadeId, albumId))
      expect(await prismaDeTeste().album.count({ where: { clubeId: c.clubeId, id: albumId } })).toBe(1)
      expect(await prismaDeTeste().foto.count({ where: { clubeId: c.clubeId, albumId } })).toBe(2)
    })

    it('album NOVO com id de album de outra unidade: 404', async () => {
      const c = await cenario()
      const alheio = await criarAlbum({ unidadeId: c.outraUnidadeId, data: '2026-09-13' })
      const resposta = await enviar(c.adm, randomUUID(), novoAlbum(c.unidadeId, alheio.id), await jpeg())
      expect(resposta.status).toBe(404)
      expect(await prismaDeTeste().foto.count({ where: { clubeId: c.clubeId } })).toBe(0)
    })

    it('album REUNIAO sem a chamada no servidor: 422', async () => {
      const c = await cenario()
      const resposta = await enviar(c.conselheiro, randomUUID(), { tipo: 'REUNIAO', unidadeId: c.unidadeId, data: '2026-09-20' }, await jpeg())
      expect(resposta.status).toBe(422)
      expect(resposta.body).toMatchObject({ codigo: 'REGRA', mensagem: 'A chamada desta reunião ainda não chegou.' })
    })

    it('album REUNIAO cria o album da reuniao uma vez e o reaproveita', async () => {
      const c = await cenario()
      const reuniao = await criarReuniao({ unidadeId: c.unidadeId, data: '2026-09-20' })
      const dados: AlbumDados = { tipo: 'REUNIAO', unidadeId: c.unidadeId, data: '2026-09-20' }
      const primeira = await enviarNovaFoto(c, c.conselheiro, dados)
      const segunda = await enviarNovaFoto(c, c.outroConselheiro, dados)
      expect(segunda.albumId).toBe(primeira.albumId)
      const album = await prismaDeTeste().album.findFirstOrThrow({ where: { clubeId: c.clubeId, id: primeira.albumId } })
      expect(album).toMatchObject({ reuniaoId: reuniao.id, unidadeId: c.unidadeId, titulo: 'Reunião · 20/09' })
      expect(await prismaDeTeste().foto.count({ where: { clubeId: c.clubeId, albumId: album.id } })).toBe(2)
    })

    it('album REUNIAO usa o album que a reuniao ja tinha', async () => {
      const c = await cenario()
      const reuniao = await criarReuniao({ unidadeId: c.unidadeId, data: '2026-09-20' })
      const existente = await criarAlbum({ unidadeId: c.unidadeId, data: '2026-09-20', reuniaoId: reuniao.id, titulo: 'Já existia' })
      const { albumId } = await enviarNovaFoto(c, c.conselheiro, { tipo: 'REUNIAO', unidadeId: c.unidadeId, data: '2026-09-20' })
      expect(albumId).toBe(existente.id)
    })

    it('album EXISTENTE: aceita o da unidade e recusa (404) o de outra unidade ou inexistente', async () => {
      const c = await cenario()
      const meu = await criarAlbum({ unidadeId: c.unidadeId, data: '2026-09-20' })
      const alheio = await criarAlbum({ unidadeId: c.outraUnidadeId, data: '2026-09-20' })
      const { albumId } = await enviarNovaFoto(c, c.conselheiro, { tipo: 'EXISTENTE', id: meu.id })
      expect(albumId).toBe(meu.id)
      expect((await enviar(c.conselheiro, randomUUID(), { tipo: 'EXISTENTE', id: alheio.id }, await jpeg())).status).toBe(404)
      expect((await enviar(c.conselheiro, randomUUID(), { tipo: 'EXISTENTE', id: randomUUID() }, await jpeg())).status).toBe(404)
      expect((await enviar(c.adm, randomUUID(), { tipo: 'EXISTENTE', id: alheio.id }, await jpeg())).status).toBe(200)
    })

    it('escopo: conselheiro em unidade que nao e sua leva 404 (NOVO e REUNIAO); Adm qualquer; instrutor 403', async () => {
      const c = await cenario()
      await criarReuniao({ unidadeId: c.outraUnidadeId, data: '2026-09-20' })
      const foraNovo = await enviar(c.conselheiro, randomUUID(), novoAlbum(c.outraUnidadeId), await jpeg())
      expect(foraNovo.status).toBe(404)
      expect(foraNovo.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
      const foraReuniao = await enviar(c.conselheiro, randomUUID(), { tipo: 'REUNIAO', unidadeId: c.outraUnidadeId, data: '2026-09-20' }, await jpeg())
      expect(foraReuniao.status).toBe(404)
      expect((await enviar(c.adm, randomUUID(), novoAlbum(c.outraUnidadeId), await jpeg())).status).toBe(200)
      expect((await enviar(c.instrutor, randomUUID(), novoAlbum(c.unidadeId), await jpeg())).status).toBe(403)
    })

    it('foto com id ja existente em album fora do escopo: 404, sem revelar o album', async () => {
      const c = await cenario()
      const alheio = await criarAlbum({ unidadeId: c.outraUnidadeId, data: '2026-09-20' })
      const foto = await criarFoto({ albumId: alheio.id })
      const resposta = await enviar(c.conselheiro, foto.id, novoAlbum(c.unidadeId), await jpeg())
      expect(resposta.status).toBe(404)
    })

    it('mais de 2 MB: 422 REGRA (nao 413)', async () => {
      const c = await cenario()
      const resposta = await enviar(c.conselheiro, randomUUID(), novoAlbum(c.unidadeId), Buffer.alloc(DOIS_MB + 1, 1))
      expect(resposta.status).toBe(422)
      expect(resposta.body).toEqual({ codigo: 'REGRA', mensagem: 'A foto precisa ter até 2 MB.' })
      expect(await prismaDeTeste().foto.count({ where: { clubeId: c.clubeId } })).toBe(0)
    })

    it('PNG com nome e tipo de JPEG e aceito pelo formato real e gravado como JPEG', async () => {
      const c = await cenario()
      const png = await sharp({ create: { width: 200, height: 100, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer()
      const fotoId = randomUUID()
      const resposta = await enviar(c.conselheiro, fotoId, novoAlbum(c.unidadeId), png, { nomeArquivo: 'foto.jpg', tipoArquivo: 'image/jpeg' })
      expect(resposta.status).toBe(200)
      const foto = await prismaDeTeste().foto.findFirstOrThrow({ where: { clubeId: c.clubeId, id: fotoId }, include: { arquivo: true } })
      expect((await sharp(await lerDoDisco(armazenamento, foto.arquivo.caminho)).metadata()).format).toBe('jpeg')
    })

    it('WEBP e aceito', async () => {
      const c = await cenario()
      const webp = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#0a0' } }).webp().toBuffer()
      expect((await enviar(c.conselheiro, randomUUID(), novoAlbum(c.unidadeId), webp, { tipoArquivo: 'image/webp' })).status).toBe(200)
    })

    it('formato que nao e jpeg/png/webp (GIF, texto com nome de JPEG): 422 "Formato de foto não aceito."', async () => {
      const c = await cenario()
      const gif = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#000' } }).gif().toBuffer()
      for (const conteudo of [gif, Buffer.from('isto nao e uma imagem')]) {
        const resposta = await enviar(c.conselheiro, randomUUID(), novoAlbum(c.unidadeId), conteudo)
        expect(resposta.status).toBe(422)
        expect(resposta.body).toMatchObject({ codigo: 'REGRA', mensagem: 'Formato de foto não aceito.' })
      }
      expect(await prismaDeTeste().foto.count({ where: { clubeId: c.clubeId } })).toBe(0)
    })

    it('50 megapixels: 422 "Foto grande demais."', async () => {
      const c = await cenario()
      const enorme = await sharp({ create: { width: 8000, height: 6250, channels: 3, background: '#888' } }).png({ compressionLevel: 9 }).toBuffer()
      expect(enorme.length).toBeLessThan(DOIS_MB)
      const resposta = await enviar(c.conselheiro, randomUUID(), novoAlbum(c.unidadeId), enorme, { tipoArquivo: 'image/png' })
      expect(resposta.status).toBe(422)
      expect(resposta.body).toMatchObject({ codigo: 'REGRA', mensagem: 'Foto grande demais.' })
      expect(await prismaDeTeste().foto.count({ where: { clubeId: c.clubeId } })).toBe(0)
    })

    it('EXIF sai: a foto gravada nao carrega metadados, nem a miniatura', async () => {
      const c = await cenario()
      const comExif = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#123456' } })
        .jpeg()
        .withExif({ IFD0: { Copyright: 'teste' } })
        .toBuffer()
      expect((await sharp(comExif).metadata()).exif).toBeDefined()
      const fotoId = randomUUID()
      expect((await enviar(c.conselheiro, fotoId, novoAlbum(c.unidadeId), comExif)).status).toBe(200)
      const foto = await prismaDeTeste().foto.findFirstOrThrow({ where: { clubeId: c.clubeId, id: fotoId }, include: { arquivo: true } })
      expect((await sharp(await lerDoDisco(armazenamento, foto.arquivo.caminho)).metadata()).exif).toBeUndefined()
      expect((await sharp(await lerDoDisco(armazenamento, foto.arquivo.miniaturaCaminho ?? '')).metadata()).exif).toBeUndefined()
    })

    it('rotate(): a orientacao do EXIF vira pixels (200x100 com orientacao 6 sai 100x200)', async () => {
      const c = await cenario()
      const deitada = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#abcdef' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
      const fotoId = randomUUID()
      expect((await enviar(c.conselheiro, fotoId, novoAlbum(c.unidadeId), deitada)).status).toBe(200)
      const foto = await prismaDeTeste().foto.findFirstOrThrow({ where: { clubeId: c.clubeId, id: fotoId }, include: { arquivo: true } })
      expect(foto.arquivo).toMatchObject({ largura: 100, altura: 200 })
    })

    it('sem o arquivo, ou com `dados` invalido: 400 VALIDACAO', async () => {
      const c = await cenario()
      expect((await enviar(c.conselheiro, randomUUID(), novoAlbum(c.unidadeId), null)).status).toBe(400)
      const semJson = await request(servidor())
        .put(`/api/sync/fotos/${randomUUID()}`)
        .set('Authorization', c.conselheiro.autorizacao)
        .field('dados', 'nao e json')
        .attach('arquivo', await jpeg(), { filename: 'a.jpg', contentType: 'image/jpeg' })
      expect(semJson.status).toBe(400)
      expect(semJson.body).toMatchObject({ codigo: 'VALIDACAO' })
      const semCampo = await request(servidor())
        .put(`/api/sync/fotos/${randomUUID()}`)
        .set('Authorization', c.conselheiro.autorizacao)
        .field('dados', JSON.stringify({ versaoPayload: 1, legenda: null }))
        .attach('arquivo', await jpeg(), { filename: 'a.jpg', contentType: 'image/jpeg' })
      expect(semCampo.status).toBe(400)
      expect((await request(servidor()).put('/api/sync/fotos/nao-e-uuid').set('Authorization', c.conselheiro.autorizacao)).status).toBe(400)
    })

    it('sem sessao: 401', async () => {
      const resposta = await request(servidor()).put(`/api/sync/fotos/${randomUUID()}`)
      expect(resposta.status).toBe(401)
    })

    it('transacao que falha: os arquivos ja gravados sao apagados', async () => {
      const c = await cenario()
      const gravados: string[] = []
      const gravar = armazenamento.gravar.bind(armazenamento)
      jest.spyOn(armazenamento, 'gravar').mockImplementation(async (caminho, buffer) => {
        gravados.push(caminho)
        await gravar(caminho, buffer)
      })
      jest.spyOn(app.get(PrismaService), '$transaction').mockRejectedValueOnce(new Error('falha no banco'))
      const resposta = await enviar(c.conselheiro, randomUUID(), novoAlbum(c.unidadeId), await jpeg())
      expect(resposta.status).toBe(500)
      expect(gravados).toHaveLength(2)
      for (const caminho of gravados) expect(existeNoDisco(armazenamento, caminho)).toBe(false)
    })

    it('corrida de album (P2002): 503 TEMPORARIO, sem sobras no disco', async () => {
      const c = await cenario()
      const gravados: string[] = []
      const gravar = armazenamento.gravar.bind(armazenamento)
      jest.spyOn(armazenamento, 'gravar').mockImplementation(async (caminho, buffer) => {
        gravados.push(caminho)
        await gravar(caminho, buffer)
      })
      const duplicado = new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'teste' })
      jest.spyOn(app.get(PrismaService), '$transaction').mockRejectedValueOnce(duplicado)
      const resposta = await enviar(c.conselheiro, randomUUID(), novoAlbum(c.unidadeId), await jpeg())
      expect(resposta.status).toBe(503)
      expect(resposta.body).toMatchObject({ codigo: 'TEMPORARIO' })
      for (const caminho of gravados) expect(existeNoDisco(armazenamento, caminho)).toBe(false)
    })

    it('duas fotos ao mesmo tempo no album da mesma reuniao: um album so; quem levou 503 acerta na nova tentativa', async () => {
      const c = await cenario()
      await criarReuniao({ unidadeId: c.unidadeId, data: '2026-09-27' })
      const dados: AlbumDados = { tipo: 'REUNIAO', unidadeId: c.unidadeId, data: '2026-09-27' }
      const ids = [randomUUID(), randomUUID(), randomUUID()]
      const imagem = await jpeg()
      const respostas = await Promise.all(ids.map((id) => enviar(c.conselheiro, id, dados, imagem)))
      for (const resposta of respostas) expect([200, 503]).toContain(resposta.status)
      expect(respostas.some((resposta) => resposta.status === 200)).toBe(true)
      for (const [posicao, resposta] of respostas.entries()) {
        if (resposta.status === 503) expect((await enviar(c.conselheiro, ids[posicao] ?? '', dados, imagem)).status).toBe(200)
      }
      expect(await prismaDeTeste().album.count({ where: { clubeId: c.clubeId, unidadeId: c.unidadeId } })).toBe(1)
      expect(await prismaDeTeste().foto.count({ where: { clubeId: c.clubeId } })).toBe(3)
    })
  })

  describe('GET /api/albuns?unidadeId', () => {
    const listar = (acesso: Acesso, consulta: string): request.Test =>
      request(servidor()).get(`/api/albuns${consulta}`).set('Authorization', acesso.autorizacao)

    it('lista os albuns da unidade por data decrescente, so os que tem foto ativa, com total, capa e autores', async () => {
      const c = await cenario()
      const antigo = await enviarNovaFoto(c, c.conselheiro, novoAlbum(c.unidadeId, randomUUID(), '2026-08-02'))
      const recente = await enviarNovaFoto(c, c.conselheiro, novoAlbum(c.unidadeId, randomUUID(), '2026-09-20'))
      await enviarNovaFoto(c, c.outroConselheiro, { tipo: 'EXISTENTE', id: recente.albumId })
      await enviarNovaFoto(c, c.conselheiro, { tipo: 'EXISTENTE', id: recente.albumId })
      const removida = await criarAlbum({ unidadeId: c.unidadeId, data: '2026-09-27' })
      await criarFoto({ albumId: removida.id, removida: true })
      await criarAlbum({ unidadeId: c.unidadeId, data: '2026-09-28' })
      await enviarNovaFoto(c, c.adm, novoAlbum(c.outraUnidadeId))

      const resposta = await listar(c.conselheiro, `?unidadeId=${c.unidadeId}`)
      expect(resposta.status).toBe(200)
      const albuns = resposta.body as { id: string; titulo: string; data: string; totalFotos: number; capaUrl: string | null; enviadoPor: string[]; reuniaoId: string | null }[]
      expect(albuns.map((album) => album.id)).toEqual([recente.albumId, antigo.albumId])
      expect(albuns[0]).toMatchObject({ titulo: 'Acampamento', data: '2026-09-20', totalFotos: 3, reuniaoId: null })
      expect(albuns[0]?.capaUrl).toMatch(/^\/api\/arquivos\/[0-9a-f-]{36}\?c=[0-9a-f-]{36}&v=miniatura&exp=\d+&sig=/)
      expect(albuns[0]?.enviadoPor.slice().sort()).toEqual([c.conselheiro.usuario.nome, c.outroConselheiro.usuario.nome].sort())
      expect(albuns[1]?.totalFotos).toBe(1)
    })

    it('a foto removida sai da contagem e, sendo a ultima, o album some', async () => {
      const c = await cenario()
      const unica = await enviarNovaFoto(c)
      const antes = await listar(c.conselheiro, `?unidadeId=${c.unidadeId}`)
      expect(antes.body).toHaveLength(1)
      await request(servidor()).delete(`/api/fotos/${unica.fotoId}`).set('Authorization', c.conselheiro.autorizacao).expect(204)
      const depois = await listar(c.conselheiro, `?unidadeId=${c.unidadeId}`)
      expect(depois.body).toEqual([])
      expect(await prismaDeTeste().album.count({ where: { clubeId: c.clubeId, id: unica.albumId } })).toBe(1)
    })

    it('escopo: Adm ve qualquer unidade; conselheiro de outra unidade 404; instrutor 403; sem unidadeId 400', async () => {
      const c = await cenario()
      await enviarNovaFoto(c, c.adm, novoAlbum(c.outraUnidadeId))
      expect((await listar(c.adm, `?unidadeId=${c.outraUnidadeId}`)).body).toHaveLength(1)
      const fora = await listar(c.conselheiro, `?unidadeId=${c.outraUnidadeId}`)
      expect(fora.status).toBe(404)
      expect(fora.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
      expect((await listar(c.instrutor, `?unidadeId=${c.unidadeId}`)).status).toBe(403)
      expect((await listar(c.conselheiro, '')).status).toBe(400)
      expect((await listar(c.adm, `?unidadeId=${randomUUID()}`)).status).toBe(404)
    })
  })

  describe('GET /api/albuns/:id', () => {
    const detalhar = (acesso: Acesso, id: string): request.Test =>
      request(servidor()).get(`/api/albuns/${id}`).set('Authorization', acesso.autorizacao)

    it('detalhe com fotos por envio crescente, sem removidas, URLs assinadas que servem e podeRemover por autoria', async () => {
      const c = await cenario()
      const albumId = randomUUID()
      const dele = await enviarNovaFoto(c, c.outroConselheiro, novoAlbum(c.unidadeId, albumId))
      const minha = await enviarNovaFoto(c, c.conselheiro, { tipo: 'EXISTENTE', id: albumId })
      const apagada = await enviarNovaFoto(c, c.conselheiro, { tipo: 'EXISTENTE', id: albumId })
      await request(servidor()).delete(`/api/fotos/${apagada.fotoId}`).set('Authorization', c.conselheiro.autorizacao).expect(204)

      const resposta = await detalhar(c.conselheiro, albumId)
      expect(resposta.status).toBe(200)
      const detalhe = resposta.body as {
        id: string
        titulo: string
        data: string
        unidade: { id: string; nome: string }
        reuniaoId: string | null
        fotos: { id: string; enviadaPor: string; enviadaEm: string; url: string; miniaturaUrl: string; podeRemover: boolean; legenda: string | null }[]
      }
      expect(detalhe).toMatchObject({ id: albumId, titulo: 'Acampamento', data: '2026-09-20', reuniaoId: null })
      expect(detalhe.unidade.id).toBe(c.unidadeId)
      expect(detalhe.fotos.map((foto) => foto.id)).toEqual([dele.fotoId, minha.fotoId])
      expect(detalhe.fotos.map((foto) => foto.podeRemover)).toEqual([false, true])
      expect(detalhe.fotos[0]?.enviadaPor).toBe(c.outroConselheiro.usuario.nome)

      const servida = await request(servidor()).get(detalhe.fotos[0]?.url ?? '').buffer(true)
      expect(servida.status).toBe(200)
      expect((await sharp(servida.body as Buffer).metadata()).format).toBe('jpeg')
      expect((await request(servidor()).get(detalhe.fotos[0]?.miniaturaUrl ?? '')).status).toBe(200)

      const comoAdm = (await detalhar(c.adm, albumId)).body as typeof detalhe
      expect(comoAdm.fotos.map((foto) => foto.podeRemover)).toEqual([true, true])
    })

    it('escopo: album de outra unidade 404 para o conselheiro; instrutor 403; id inexistente 404', async () => {
      const c = await cenario()
      const alheio = await criarAlbum({ unidadeId: c.outraUnidadeId, data: '2026-09-20' })
      expect((await detalhar(c.conselheiro, alheio.id)).status).toBe(404)
      expect((await detalhar(c.adm, alheio.id)).status).toBe(200)
      expect((await detalhar(c.instrutor, alheio.id)).status).toBe(403)
      expect((await detalhar(c.adm, randomUUID())).status).toBe(404)
      expect((await detalhar(c.adm, 'x')).status).toBe(400)
    })
  })

  describe('DELETE /api/fotos/:id', () => {
    const remover = (acesso: Acesso, id: string): request.Test =>
      request(servidor()).delete(`/api/fotos/${id}`).set('Authorization', acesso.autorizacao)

    async function caminhosDaFoto(clubeId: string, fotoId: string): Promise<string[]> {
      const foto = await prismaDeTeste().foto.findFirstOrThrow({ where: { clubeId, id: fotoId }, include: { arquivo: true } })
      return [foto.arquivo.caminho, foto.arquivo.miniaturaCaminho ?? '']
    }

    it('autor remove: 204, marca removidaEm e removidaPorId e apaga os dois arquivos do disco', async () => {
      const c = await cenario()
      const { fotoId } = await enviarNovaFoto(c)
      const caminhos = await caminhosDaFoto(c.clubeId, fotoId)
      for (const caminho of caminhos) expect(existeNoDisco(armazenamento, caminho)).toBe(true)

      expect((await remover(c.conselheiro, fotoId)).status).toBe(204)
      const foto = await prismaDeTeste().foto.findFirstOrThrow({ where: { clubeId: c.clubeId, id: fotoId } })
      expect(foto.removidaEm).not.toBeNull()
      expect(foto.removidaPorId).toBe(c.conselheiro.usuario.id)
      for (const caminho of caminhos) expect(existeNoDisco(armazenamento, caminho)).toBe(false)
    })

    it('ja removida: 404', async () => {
      const c = await cenario()
      const { fotoId } = await enviarNovaFoto(c)
      await remover(c.conselheiro, fotoId).expect(204)
      const segunda = await remover(c.conselheiro, fotoId)
      expect(segunda.status).toBe(404)
      expect(segunda.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
    })

    it('conselheiro com foto de outro: 403 e a foto fica; Adm remove qualquer uma', async () => {
      const c = await cenario()
      const { fotoId } = await enviarNovaFoto(c, c.outroConselheiro)
      const negada = await remover(c.conselheiro, fotoId)
      expect(negada.status).toBe(403)
      expect(negada.body).toMatchObject({ codigo: 'SEM_PERMISSAO' })
      expect((await prismaDeTeste().foto.findFirstOrThrow({ where: { clubeId: c.clubeId, id: fotoId } })).removidaEm).toBeNull()
      expect((await remover(c.adm, fotoId)).status).toBe(204)
    })

    it('escopo: foto de album fora da unidade do conselheiro 404 (mesmo sendo o autor); instrutor 403; id inexistente 404', async () => {
      const c = await cenario()
      const { fotoId } = await enviarNovaFoto(c, c.adm, novoAlbum(c.outraUnidadeId))
      expect((await remover(c.conselheiro, fotoId)).status).toBe(404)
      expect((await remover(c.instrutor, fotoId)).status).toBe(403)
      expect((await remover(c.adm, randomUUID())).status).toBe(404)
      expect((await remover(c.adm, 'x')).status).toBe(400)
    })

    it('falha ao apagar do disco nao desfaz a remocao: 204 e o erro vai ao log', async () => {
      const c = await cenario()
      const { fotoId } = await enviarNovaFoto(c)
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
      jest.spyOn(armazenamento, 'remover').mockRejectedValue(new Error('disco cheio'))
      expect((await remover(c.conselheiro, fotoId)).status).toBe(204)
      expect((await prismaDeTeste().foto.findFirstOrThrow({ where: { clubeId: c.clubeId, id: fotoId } })).removidaEm).not.toBeNull()
      expect(log).toHaveBeenCalled()
    })
  })

  describe('limpeza na subida da API', () => {
    it('apaga do disco os arquivos de fotos removidas que sobraram, sem tocar nas ativas', async () => {
      const c = await cenario()
      const album = await criarAlbum({ unidadeId: c.unidadeId, data: '2026-09-20' })
      const removida = await criarFoto({ albumId: album.id, removida: true })
      const ativa = await criarFoto({ albumId: album.id })
      const arquivos = await prismaDeTeste().arquivo.findMany({ where: { clubeId: c.clubeId, id: { in: [removida.arquivoId, ativa.arquivoId] } } })
      for (const arquivo of arquivos) {
        await armazenamento.gravar(arquivo.caminho, await jpeg())
        await armazenamento.gravar(arquivo.miniaturaCaminho ?? '', await jpeg())
      }
      const daRemovida = arquivos.find((arquivo) => arquivo.id === removida.arquivoId)
      const daAtiva = arquivos.find((arquivo) => arquivo.id === ativa.arquivoId)

      await app.get(LimpezaDeFotos).limpar()

      expect(existeNoDisco(armazenamento, daRemovida?.caminho ?? '')).toBe(false)
      expect(existeNoDisco(armazenamento, daRemovida?.miniaturaCaminho ?? '')).toBe(false)
      expect(existeNoDisco(armazenamento, daAtiva?.caminho ?? '')).toBe(true)
      expect(existeNoDisco(armazenamento, daAtiva?.miniaturaCaminho ?? '')).toBe(true)
    })

    it('trabalha em lotes de 100: passa por mais de 100 fotos removidas', async () => {
      const c = await cenario()
      const album = await criarAlbum({ unidadeId: c.unidadeId, data: '2026-09-20' })
      const remover = jest.spyOn(armazenamento, 'remover')
      for (let i = 0; i < 101; i++) await criarFoto({ albumId: album.id, removida: true })
      await app.get(LimpezaDeFotos).limpar()
      const dasFotos = remover.mock.calls.filter(([caminho]) => caminho.startsWith(`clube/${c.clubeId}/`))
      expect(dasFotos).toHaveLength(202)
    })

    it('uma falha ao apagar um arquivo vai ao log e nao derruba a subida', async () => {
      const c = await cenario()
      const album = await criarAlbum({ unidadeId: c.unidadeId, data: '2026-09-20' })
      await criarFoto({ albumId: album.id, removida: true })
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
      jest.spyOn(armazenamento, 'remover').mockRejectedValue(new Error('sem acesso'))
      await expect(app.get(LimpezaDeFotos).limpar()).resolves.toBeUndefined()
      expect(log).toHaveBeenCalled()
    })
  })

  describe('GET /api/unidades/:id/sem-autorizacao-imagem', () => {
    const consultar = (acesso: Acesso, unidadeId: string): request.Test =>
      request(servidor()).get(`/api/unidades/${unidadeId}/sem-autorizacao-imagem`).set('Authorization', acesso.autorizacao)

    it('nomes publicos, em ordem alfabetica, so de DBV ativo, membro atual e sem autorizacao', async () => {
      const c = await cenario()
      const prisma = prismaDeTeste()
      const semAutorizacao = async (nome: string, dados: { ativo?: boolean; tipo?: 'DBV' | 'LIDER'; autorizado?: boolean; unidadeId?: string; ex?: boolean } = {}) => {
        const dbv = await criarDbv({ clubeId: c.clubeId, nome, ativo: dados.ativo, tipo: dados.tipo })
        if (dados.autorizado) await prisma.desbravador.update({ where: { clubeId: c.clubeId, id: dbv.id }, data: { autorizacaoImagem: true } })
        await criarMembro({ dbvId: dbv.id, unidadeId: dados.unidadeId ?? c.unidadeId, inicio: '2026-02-01', fim: dados.ex ? '2026-06-01' : undefined })
      }
      await semAutorizacao('Zeca Souza')
      await semAutorizacao('Ana Lima')
      await semAutorizacao('Bia Autorizada', { autorizado: true })
      await semAutorizacao('Caio Inativo', { ativo: false })
      await semAutorizacao('Dora Lider', { tipo: 'LIDER' })
      await semAutorizacao('Edu Outra', { unidadeId: c.outraUnidadeId })
      await semAutorizacao('Fabi Saiu', { ex: true })

      const resposta = await consultar(c.conselheiro, c.unidadeId)
      expect(resposta.status).toBe(200)
      expect(resposta.body).toEqual({ nomes: ['Ana', 'Zeca'] })
    })

    it('unidade sem ninguem nessa situacao: lista vazia', async () => {
      const c = await cenario()
      expect((await consultar(c.adm, c.unidadeId)).body).toEqual({ nomes: [] })
    })

    it('escopo: conselheiro de outra unidade 404; Adm qualquer; instrutor 403; id de outro clube 404', async () => {
      const c = await cenario()
      expect((await consultar(c.conselheiro, c.outraUnidadeId)).status).toBe(404)
      expect((await consultar(c.adm, c.outraUnidadeId)).status).toBe(200)
      expect((await consultar(c.instrutor, c.unidadeId)).status).toBe(403)
      expect((await consultar(c.adm, randomUUID())).status).toBe(404)
    })
  })
})
