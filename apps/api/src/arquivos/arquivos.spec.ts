import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type { Response } from 'express'
import request from 'supertest'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  criarAlbum,
  criarArquivo,
  criarClube,
  criarFoto,
  criarUnidade,
  criarUsuario,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ArquivosController } from './arquivos.controller'
import { ARMAZENAMENTO, ArmazenamentoDisco, type Armazenamento } from './armazenamento'
import { ServicoArquivos, caminhoDaBiblioteca, caminhoDoMaterial } from './servico-arquivos'

// Embrulha rename/readFile para espiar as chamadas; sem `mockImplementation`, valem as reais.
jest.mock('node:fs/promises', () => {
  const real = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises')
  return { ...real, rename: jest.fn(real.rename), readFile: jest.fn(real.readFile) }
})

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

  describe('gravarDeArquivo', () => {
    beforeEach(() => jest.mocked(readFile).mockClear())

    it('move o temporario para o destino (o temporario deixa de existir) sem ler o conteudo para a memoria', async () => {
      const disco = new ArmazenamentoDisco(raiz)
      const temporario = join(raiz, 'upload.tmp')
      await writeFile(temporario, JPEG)
      await disco.gravarDeArquivo('clube/x/materiais/2026/a.pdf', temporario)
      expect(readFile).not.toHaveBeenCalled()
      expect(await readFile(join(raiz, 'clube/x/materiais/2026/a.pdf'))).toEqual(JPEG)
      await expect(readFile(temporario)).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('em outro volume (EXDEV) copia em stream e apaga o temporario', async () => {
      const disco = new ArmazenamentoDisco(raiz)
      const temporario = join(raiz, 'upload.tmp')
      await writeFile(temporario, JPEG)
      jest.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('cross-device'), { code: 'EXDEV' }))
      await disco.gravarDeArquivo('clube/x/materiais/2026/b.pdf', temporario)
      expect(readFile).not.toHaveBeenCalled()
      expect(await readFile(join(raiz, 'clube/x/materiais/2026/b.pdf'))).toEqual(JPEG)
      await expect(readFile(temporario)).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('outro erro do rename nao e engolido, e o destino nao pode escapar da raiz', async () => {
      const disco = new ArmazenamentoDisco(raiz)
      const temporario = join(raiz, 'upload.tmp')
      await writeFile(temporario, JPEG)
      jest.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('sem permissao'), { code: 'EACCES' }))
      await expect(disco.gravarDeArquivo('clube/x/c.pdf', temporario)).rejects.toThrow('sem permissao')
      await expect(disco.gravarDeArquivo('../fora.pdf', temporario)).rejects.toThrow()
    })
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

describe('caminhoDoMaterial', () => {
  it('monta clube/<clube>/materiais/<ano>/<arquivo>.<ext>', () => {
    expect(caminhoDoMaterial('c1', 'a1', 'pdf', 2026)).toBe('clube/c1/materiais/2026/a1.pdf')
    expect(caminhoDoMaterial('c1', 'a1', 'docx')).toBe(`clube/c1/materiais/${new Date().getUTCFullYear()}/a1.docx`)
  })
})

describe('GET /api/arquivos/:id (documentos de material)', () => {
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

  const PDF = Buffer.from('%PDF-1.4 fake')
  const DOCX = Buffer.from('PK fake docx')
  const MIME_PDF = 'application/pdf'
  const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  async function material(dados: { titulo: string; ext: 'pdf' | 'docx'; removido?: boolean }) {
    const clube = await criarClube()
    const enviadoPorId = (await criarUsuario()).id
    const classe = await classeOficial('Amigo')
    const arquivoId = randomUUID()
    const caminho = caminhoDoMaterial(clube.id, arquivoId, dados.ext)
    const arquivo = await prismaDeTeste().arquivo.create({
      data: {
        id: arquivoId, clubeId: clube.id, caminho, miniaturaCaminho: null, bytes: 10, criadoPorId: enviadoPorId,
        mime: dados.ext === 'pdf' ? MIME_PDF : MIME_DOCX,
      },
    })
    await armazenamento.gravar(caminho, dados.ext === 'pdf' ? PDF : DOCX)
    await prismaDeTeste().material.create({
      data: {
        clubeId: clube.id, classeId: classe.id, titulo: dados.titulo, tipo: dados.ext === 'pdf' ? 'PDF' : 'DOCUMENTO',
        arquivoId: arquivo.id, enviadoPorId, removidoEm: dados.removido ? new Date() : null,
      },
    })
    return servico.urlAssinada(clube.id, arquivo.id, 'original')
  }
  const pedir = (url: string): request.Test => request(app.getHttpServer() as Server).get(url).buffer(true)

  it('PDF: mime do banco, inline, nosniff e sem CSP sandbox', async () => {
    const resposta = await pedir(await material({ titulo: 'Guia', ext: 'pdf' }))
    expect(resposta.status).toBe(200)
    expect(resposta.headers['content-type']).toContain(MIME_PDF)
    expect(resposta.headers['content-disposition']).toMatch(/^inline; filename="Guia\.pdf"; filename\*=UTF-8''Guia\.pdf$/)
    expect(resposta.headers['x-content-type-options']).toBe('nosniff')
    expect(resposta.headers['content-security-policy']).toBeUndefined()
    expect(resposta.body).toEqual(PDF)
  })

  it('DOCX: attachment, nosniff e CSP sandbox', async () => {
    const resposta = await pedir(await material({ titulo: 'Plano', ext: 'docx' }))
    expect(resposta.status).toBe(200)
    expect(resposta.headers['content-type']).toContain(MIME_DOCX)
    expect(resposta.headers['content-disposition']).toMatch(/^attachment; filename="Plano\.docx"/)
    expect(resposta.headers['x-content-type-options']).toBe('nosniff')
    expect(resposta.headers['content-security-policy']).toBe('sandbox')
  })

  it('titulo com acento e travessao ("Lição — 1") nao derruba a resposta e sai em filename*', async () => {
    const resposta = await pedir(await material({ titulo: 'Lição — 1', ext: 'pdf' }))
    expect(resposta.status).toBe(200)
    const cabecalho = String(resposta.headers['content-disposition'])
    expect(cabecalho).toContain('filename="Licao 1.pdf"')
    expect(cabecalho).toContain("filename*=UTF-8''Li%C3%A7%C3%A3o%20%E2%80%94%201.pdf")
  })

  it('aspas, barras e caracteres de controle do titulo nao chegam ao cabecalho', async () => {
    const resposta = await pedir(await material({ titulo: 'A "b"/c\\d\te', ext: 'docx' }))
    expect(resposta.status).toBe(200)
    const cabecalho = String(resposta.headers['content-disposition'])
    expect(cabecalho).toContain('filename="A bcde.docx"')
    expect(cabecalho).not.toMatch(/%22|%2F|%5C|%09/)
  })

  it('material removido: 404', async () => {
    expect((await pedir(await material({ titulo: 'Velho', ext: 'pdf', removido: true }))).status).toBe(404)
  })

  it('foto continua image/jpeg, inline, com nosniff e sob sandbox', async () => {
    const clube = await criarClube()
    const unidade = await criarUnidade({ clubeId: clube.id })
    const album = await criarAlbum({ unidadeId: unidade.id, data: '2026-09-20' })
    const foto = await criarFoto({ albumId: album.id })
    const arquivo = await prisma.arquivo.findFirstOrThrow({ where: { clubeId: clube.id, id: foto.arquivoId } })
    await armazenamento.gravar(arquivo.caminho, JPEG)
    const resposta = await pedir(servico.urlAssinada(clube.id, arquivo.id, 'original'))
    expect(resposta.headers['content-type']).toContain('image/jpeg')
    expect(resposta.headers['x-content-type-options']).toBe('nosniff')
    expect(resposta.headers['content-disposition']).toBeUndefined()
    expect(resposta.headers['content-security-policy']).toBe('sandbox')
  })
})

describe('GET /api/arquivos/:id (biblioteca)', () => {
  let app: INestApplication
  let armazenamento: Armazenamento
  let servico: ServicoArquivos

  beforeAll(async () => {
    app = await criarAppDeTeste()
    armazenamento = app.get<Armazenamento>(ARMAZENAMENTO)
    servico = app.get(ServicoArquivos)
  })
  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  const PDF = Buffer.from('%PDF-1.4 fake biblioteca')
  const pedir = (url: string): request.Test => request(app.getHttpServer() as Server).get(url).buffer(true)

  /** Item com PDF e capa gravados no disco; `removido` marca o item inteiro como removido. */
  async function itemComCapa(dados: { nome: string; removido?: boolean }) {
    const clube = await criarClube()
    const enviadoPorId = (await criarUsuario()).id
    const categoria = await prismaDeTeste().categoriaBiblioteca.create({ data: { clubeId: clube.id, nome: 'Livros de teste', ordem: 10 } })
    const arquivoId = randomUUID()
    const capaId = randomUUID()
    const arquivo = await criarArquivo({
      clubeId: clube.id, criadoPorId: enviadoPorId, mime: 'application/pdf', miniaturaCaminho: null,
      caminho: caminhoDaBiblioteca(clube.id, arquivoId, 'pdf'),
    })
    const capa = await criarArquivo({
      clubeId: clube.id, criadoPorId: enviadoPorId, mime: 'image/jpeg',
      caminho: caminhoDaBiblioteca(clube.id, capaId, 'jpg'),
      miniaturaCaminho: caminhoDaBiblioteca(clube.id, capaId, 'jpg', true),
    })
    await armazenamento.gravar(arquivo.caminho, PDF)
    await armazenamento.gravar(capa.caminho, JPEG)
    await armazenamento.gravar(capa.miniaturaCaminho ?? '', MINIATURA)
    await prismaDeTeste().itemBiblioteca.create({
      data: {
        clubeId: clube.id, categoriaId: categoria.id, nome: dados.nome, ordem: 1, arquivoId: arquivo.id, capaId: capa.id,
        enviadoPorId, removidoEm: dados.removido ? new Date() : null, removidoPorId: dados.removido ? enviadoPorId : null,
      },
    })
    return { clube, arquivo, capa }
  }

  it('baixar: PDF do item sai attachment com o nome do item, sem CSP sandbox', async () => {
    const { clube, arquivo } = await itemComCapa({ nome: 'Manual de Liderança' })
    const resposta = await pedir(servico.urlAssinada(clube.id, arquivo.id, 'baixar'))
    expect(resposta.status).toBe(200)
    expect(resposta.headers['content-type']).toContain('application/pdf')
    expect(resposta.headers['content-disposition']).toBe(
      `attachment; filename="Manual de Lideranca.pdf"; filename*=UTF-8''Manual%20de%20Lideran%C3%A7a.pdf`,
    )
    expect(resposta.headers['x-content-type-options']).toBe('nosniff')
    expect(resposta.headers['content-security-policy']).toBeUndefined()
    expect(resposta.body).toEqual(PDF)
  })

  it('original: o mesmo PDF abre inline, com o nome do item', async () => {
    const { clube, arquivo } = await itemComCapa({ nome: 'Manual de Liderança' })
    const resposta = await pedir(servico.urlAssinada(clube.id, arquivo.id, 'original'))
    expect(resposta.status).toBe(200)
    expect(resposta.headers['content-disposition']).toBe(
      `inline; filename="Manual de Lideranca.pdf"; filename*=UTF-8''Manual%20de%20Lideran%C3%A7a.pdf`,
    )
    expect(resposta.body).toEqual(PDF)
  })

  it('a assinatura de original nao serve para baixar (e vice-versa): 403', async () => {
    const { clube, arquivo } = await itemComCapa({ nome: 'Guia' })
    const leitura = servico.urlAssinada(clube.id, arquivo.id, 'original')
    expect((await pedir(leitura.replace('v=original', 'v=baixar'))).status).toBe(403)
    const download = servico.urlAssinada(clube.id, arquivo.id, 'baixar')
    expect((await pedir(download.replace('v=baixar', 'v=original'))).status).toBe(403)
  })

  it('capa ativa: original e miniatura servem image/jpeg, sem disposicao e sob sandbox', async () => {
    const { clube, capa } = await itemComCapa({ nome: 'Guia' })
    const original = await pedir(servico.urlAssinada(clube.id, capa.id, 'original'))
    expect(original.status).toBe(200)
    expect(original.headers['content-type']).toContain('image/jpeg')
    expect(original.headers['content-disposition']).toBeUndefined()
    expect(original.headers['content-security-policy']).toBe('sandbox')
    expect(original.body).toEqual(JPEG)
    const miniatura = await pedir(servico.urlAssinada(clube.id, capa.id, 'miniatura'))
    expect(miniatura.status).toBe(200)
    expect(miniatura.headers['content-type']).toContain('image/jpeg')
    expect(miniatura.headers['content-disposition']).toBeUndefined()
    expect(miniatura.body).toEqual(MINIATURA)
  })

  it('baixar sai attachment qualquer que seja o mime, ate a imagem', async () => {
    const { clube, capa } = await itemComCapa({ nome: 'Guia' })
    const resposta = await pedir(servico.urlAssinada(clube.id, capa.id, 'baixar'))
    expect(resposta.status).toBe(200)
    expect(resposta.headers['content-type']).toContain('image/jpeg')
    expect(resposta.headers['content-disposition']).toMatch(/^attachment; filename="arquivo\.jpg"/)
    expect(resposta.body).toEqual(JPEG)
  })

  it('item removido: 404 no PDF (original e baixar) e na capa (original, baixar e miniatura)', async () => {
    const { clube, arquivo, capa } = await itemComCapa({ nome: 'Velho', removido: true })
    for (const variante of ['original', 'baixar'] as const) {
      expect((await pedir(servico.urlAssinada(clube.id, arquivo.id, variante))).status).toBe(404)
      expect((await pedir(servico.urlAssinada(clube.id, capa.id, variante))).status).toBe(404)
    }
    expect((await pedir(servico.urlAssinada(clube.id, capa.id, 'miniatura'))).status).toBe(404)
  })

  it('material: baixar sai attachment com o titulo do material', async () => {
    const clube = await criarClube()
    const enviadoPorId = (await criarUsuario()).id
    const classe = await classeOficial('Amigo')
    const arquivoId = randomUUID()
    const caminho = caminhoDoMaterial(clube.id, arquivoId, 'pdf')
    const arquivo = await prismaDeTeste().arquivo.create({
      data: { id: arquivoId, clubeId: clube.id, caminho, miniaturaCaminho: null, bytes: 10, criadoPorId: enviadoPorId, mime: 'application/pdf' },
    })
    await armazenamento.gravar(caminho, PDF)
    await prismaDeTeste().material.create({
      data: { clubeId: clube.id, classeId: classe.id, titulo: 'Guia', tipo: 'PDF', arquivoId: arquivo.id, enviadoPorId },
    })
    const resposta = await pedir(servico.urlAssinada(clube.id, arquivo.id, 'baixar'))
    expect(resposta.status).toBe(200)
    expect(resposta.headers['content-disposition']).toBe(`attachment; filename="Guia.pdf"; filename*=UTF-8''Guia.pdf`)
  })
})
