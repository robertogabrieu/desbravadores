import { randomUUID } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import {
  COTA_DA_BIBLIOTECA_BYTES,
  type BibliotecaSaida,
  type CategoriaBibliotecaSaida,
  type ItemBibliotecaSaida,
} from '@desbravadores/shared'
import request from 'supertest'
import sharp from 'sharp'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarArquivo,
  criarClube,
  criarUsuario,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  type Acesso,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { corpo } from '../../test/p6'
import { ARMAZENAMENTO, type Armazenamento } from '../arquivos/armazenamento'
import { PASTA_TEMPORARIA_DA_BIBLIOTECA } from './biblioteca.controller'

interface Erro {
  codigo: string
  mensagem: string
  campos?: Record<string, string>
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')
const PNG_FALSO = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const MB = 1024 * 1024

async function imagem(formato: 'png' | 'jpeg' | 'webp' = 'png', lado = 60): Promise<Buffer> {
  const base = sharp({ create: { width: lado, height: lado, channels: 3, background: '#2f7d32' } })
  if (formato === 'jpeg') return base.jpeg().toBuffer()
  if (formato === 'webp') return base.webp().toBuffer()
  return base.png().toBuffer()
}

describe('biblioteca do clube', () => {
  let app: INestApplication
  let armazenamento: Armazenamento
  const doApp = (): INestApplication => app
  const servidor = (): Server => app.getHttpServer() as Server

  beforeAll(async () => {
    app = await criarAppDeTeste()
    armazenamento = app.get<Armazenamento>(ARMAZENAMENTO)
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  /** Clube sem categoria alguma (o clube novo ja nasce com as iniciais) e um acesso de cada papel. */
  async function cenario() {
    const clube = await criarClube()
    await prismaDeTeste().categoriaBiblioteca.deleteMany({ where: { clubeId: clube.id } })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
    return { clube, adm, conselheiro, instrutor }
  }

  const categoriaDireta = (clubeId: string, nome: string, ordem: number, removida = false) =>
    prismaDeTeste().categoriaBiblioteca.create({ data: { clubeId, nome, ordem, removidaEm: removida ? new Date() : null } })

  async function itemDireto(dados: {
    clubeId: string
    categoriaId: string
    nome: string
    ordem: number
    enviadoPorId: string
    bytes?: number
    removido?: boolean
    capa?: { bytes: number }
  }) {
    const caminhoPdf = `clube/${dados.clubeId}/biblioteca/${randomUUID()}.pdf`
    await armazenamento.gravar(caminhoPdf, PDF)
    const pdf = await criarArquivo({
      clubeId: dados.clubeId,
      criadoPorId: dados.enviadoPorId,
      caminho: caminhoPdf,
      mime: 'application/pdf',
      miniaturaCaminho: null,
      bytes: dados.bytes ?? PDF.length,
    })
    let capa = null
    if (dados.capa) {
      const base = `clube/${dados.clubeId}/biblioteca/${randomUUID()}`
      await armazenamento.gravar(`${base}.jpg`, PDF)
      await armazenamento.gravar(`${base}-min.jpg`, PDF)
      capa = await criarArquivo({
        clubeId: dados.clubeId,
        criadoPorId: dados.enviadoPorId,
        caminho: `${base}.jpg`,
        miniaturaCaminho: `${base}-min.jpg`,
        mime: 'image/jpeg',
        bytes: dados.capa.bytes,
      })
    }
    const item = await prismaDeTeste().itemBiblioteca.create({
      data: {
        clubeId: dados.clubeId,
        categoriaId: dados.categoriaId,
        nome: dados.nome,
        ordem: dados.ordem,
        arquivoId: pdf.id,
        capaId: capa?.id ?? null,
        enviadoPorId: dados.enviadoPorId,
        removidoEm: dados.removido ? new Date() : null,
      },
    })
    return { item, pdf, capa }
  }

  const get = (acesso: Acesso, caminho: string): request.Test => request(servidor()).get(caminho).set('Authorization', acesso.autorizacao)
  const enviar = (metodo: 'post' | 'patch' | 'delete', acesso: Acesso, caminho: string, dados?: object): request.Test =>
    request(servidor())[metodo](caminho).set('Authorization', acesso.autorizacao).send(dados ?? {})

  function enviarItem(acesso: Acesso, dados: Record<string, unknown>, arquivo: Buffer | null, nomeDoArquivo = 'livro.pdf'): request.Test {
    const pedido = request(servidor())
      .post('/api/biblioteca/itens')
      .set('Authorization', acesso.autorizacao)
      .field('dados', JSON.stringify(dados))
    return arquivo ? pedido.attach('arquivo', arquivo, { filename: nomeDoArquivo }) : pedido
  }

  const enviarCapa = (acesso: Acesso, itemId: string, arquivo: Buffer, nomeDoArquivo = 'capa.png'): request.Test =>
    request(servidor())
      .put(`/api/biblioteca/itens/${itemId}/capa`)
      .set('Authorization', acesso.autorizacao)
      .attach('capa', arquivo, { filename: nomeDoArquivo })

  const existeNoDisco = (caminho: string): boolean => {
    try {
      armazenamento.abrir(caminho).destroy()
      return true
    } catch {
      return false
    }
  }

  const arquivosDaPasta = (clubeId: string): string[] => {
    try {
      return readdirSync(join(process.env['TESTE_ARQUIVOS_DIR'] ?? '', 'clube', clubeId, 'biblioteca'))
    } catch {
      return []
    }
  }

  const temporarios = (): string[] => {
    try {
      return readdirSync(PASTA_TEMPORARIA_DA_BIBLIOTECA)
    } catch {
      return []
    }
  }

  const ordensDe = async (clubeId: string, categoriaId: string): Promise<number[]> =>
    (await prismaDeTeste().itemBiblioteca.findMany({ where: { clubeId, categoriaId, removidoEm: null }, select: { ordem: true } }))
      .map((linha) => linha.ordem)
      .sort((a, b) => a - b)

  describe('lista', () => {
    it('traz so as categorias e itens ativos do clube, na ordem; Adm, conselheiro e instrutor leem', async () => {
      const { clube, adm, conselheiro, instrutor } = await cenario()
      const segunda = await categoriaDireta(clube.id, 'Manuais', 2)
      const primeira = await categoriaDireta(clube.id, 'Livros', 1)
      await categoriaDireta(clube.id, 'Antiga', 0, true)
      const dono = adm.usuario.id
      const segundo = await itemDireto({ clubeId: clube.id, categoriaId: primeira.id, nome: 'Segundo', ordem: 2, enviadoPorId: dono })
      const primeiro = await itemDireto({
        clubeId: clube.id,
        categoriaId: primeira.id,
        nome: 'Primeiro',
        ordem: 1,
        enviadoPorId: dono,
        bytes: 1234,
        capa: { bytes: 500 },
      })
      await itemDireto({ clubeId: clube.id, categoriaId: primeira.id, nome: 'Removido', ordem: 0, enviadoPorId: dono, removido: true })
      await itemDireto({ clubeId: clube.id, categoriaId: segunda.id, nome: 'Manual', ordem: 1, enviadoPorId: dono })
      const outro = await criarClube()
      const categoriaAlheia = await categoriaDireta(outro.id, 'Alheia', 1)
      await itemDireto({ clubeId: outro.id, categoriaId: categoriaAlheia.id, nome: 'Item alheio', ordem: 1, enviadoPorId: dono })

      for (const acesso of [adm, conselheiro, instrutor]) {
        const resposta = await get(acesso, '/api/biblioteca').expect(200)
        const lista = corpo<BibliotecaSaida>(resposta)
        expect(lista.categorias.map((categoria) => categoria.nome)).toEqual(['Livros', 'Manuais'])
        expect(lista.categorias[0]?.itens.map((item) => item.nome)).toEqual(['Primeiro', 'Segundo'])
        expect(lista.categorias[1]?.itens.map((item) => item.nome)).toEqual(['Manual'])
        const texto = JSON.stringify(resposta.body)
        for (const proibido of ['Item alheio', 'Alheia', 'Removido', 'Antiga']) expect(texto).not.toContain(proibido)
      }

      const [livros] = corpo<BibliotecaSaida>(await get(adm, '/api/biblioteca').expect(200)).categorias
      const [itemPrimeiro, itemSegundo] = livros?.itens ?? []
      expect(itemPrimeiro).toMatchObject({ id: primeiro.item.id, categoriaId: primeira.id, descricao: null, bytes: 1234 })
      expect(itemPrimeiro?.urlLer).toMatch(new RegExp(`^/api/arquivos/${primeiro.pdf.id}\\?c=${clube.id}&v=original&exp=\\d+&sig=`))
      expect(itemPrimeiro?.urlBaixar).toMatch(new RegExp(`^/api/arquivos/${primeiro.pdf.id}\\?c=${clube.id}&v=baixar&exp=\\d+&sig=`))
      expect(itemPrimeiro?.capaUrl).toMatch(new RegExp(`^/api/arquivos/${primeiro.capa?.id}\\?c=${clube.id}&v=miniatura&exp=\\d+&sig=`))
      expect(itemSegundo).toMatchObject({ id: segundo.item.id, capaUrl: null })
    })

    it('clube sem categoria devolve a lista vazia', async () => {
      const { adm } = await cenario()
      expect(corpo<BibliotecaSaida>(await get(adm, '/api/biblioteca').expect(200))).toEqual({ categorias: [] })
    })

    it('sem sessao responde 401', async () => {
      await request(servidor()).get('/api/biblioteca').expect(401)
    })
  })

  describe('permissao de escrita', () => {
    it('conselheiro e instrutor sao recusados (403) em todas as rotas de escrita e nada muda', async () => {
      const { clube, adm, conselheiro, instrutor } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const { item } = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'Livro', ordem: 1, enviadoPorId: adm.usuario.id })
      const base = '/api/biblioteca'
      const rotas: Array<['post' | 'patch' | 'put' | 'delete', string]> = [
        ['post', `${base}/categorias`],
        ['patch', `${base}/categorias/${categoria.id}`],
        ['post', `${base}/categorias/${categoria.id}/mover`],
        ['delete', `${base}/categorias/${categoria.id}`],
        ['post', `${base}/itens`],
        ['patch', `${base}/itens/${item.id}`],
        ['put', `${base}/itens/${item.id}/capa`],
        ['delete', `${base}/itens/${item.id}/capa`],
        ['post', `${base}/itens/${item.id}/mover`],
        ['delete', `${base}/itens/${item.id}`],
      ]
      for (const acesso of [conselheiro, instrutor]) {
        for (const [metodo, caminho] of rotas) {
          const resposta = await request(servidor())[metodo](caminho).set('Authorization', acesso.autorizacao).send({})
          expect([metodo, caminho, resposta.status, corpo<Erro>(resposta).codigo]).toEqual([metodo, caminho, 403, 'SEM_PERMISSAO'])
        }
      }
      expect(await prismaDeTeste().categoriaBiblioteca.count({ where: { clubeId: clube.id, removidaEm: null } })).toBe(1)
      expect(await prismaDeTeste().itemBiblioteca.count({ where: { clubeId: clube.id, removidoEm: null } })).toBe(1)
    })
  })

  describe('criar item', () => {
    it('PDF real vira item no fim da categoria, com Arquivo no disco e URLs de ler e baixar', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'Existente', ordem: 7, enviadoPorId: adm.usuario.id })

      const resposta = await enviarItem(adm, { nome: '  Amigo  ', descricao: 'Caderno da classe', categoriaId: categoria.id }, PDF, 'Qualquer Nome.PDF').expect(201)
      const item = corpo<ItemBibliotecaSaida>(resposta)
      expect(item).toMatchObject({ nome: 'Amigo', descricao: 'Caderno da classe', categoriaId: categoria.id, bytes: PDF.length, capaUrl: null })
      expect(item.urlLer).toMatch(/&v=original&/)
      expect(item.urlBaixar).toMatch(/&v=baixar&/)

      const linha = await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id }, include: { arquivo: true } })
      expect(linha).toMatchObject({ clubeId: clube.id, ordem: 8, enviadoPorId: adm.usuario.id, removidoEm: null, capaId: null })
      expect(linha.arquivo).toMatchObject({ clubeId: clube.id, mime: 'application/pdf', bytes: PDF.length, criadoPorId: adm.usuario.id })
      expect(linha.arquivo.caminho).toBe(`clube/${clube.id}/biblioteca/${linha.arquivoId}.pdf`)
      expect(linha.arquivoId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(existeNoDisco(linha.arquivo.caminho)).toBe(true)
    })

    it('categoria vazia: o primeiro item e o segundo entram em sequencia', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      await enviarItem(adm, { nome: 'Um', categoriaId: categoria.id }, PDF).expect(201)
      await enviarItem(adm, { nome: 'Dois', categoriaId: categoria.id }, PDF).expect(201)
      const lista = corpo<BibliotecaSaida>(await get(adm, '/api/biblioteca').expect(200))
      expect(lista.categorias[0]?.itens.map((item) => item.nome)).toEqual(['Um', 'Dois'])
      const [primeiro, segundo] = await ordensDe(clube.id, categoria.id)
      expect(segundo).toBe((primeiro ?? 0) + 1)
    })

    it('PNG renomeado .pdf e recusado (422 "O arquivo nao e um PDF.") e o temporario some', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const antes = temporarios()
      const resposta = await enviarItem(adm, { nome: 'Falso', categoriaId: categoria.id }, PNG_FALSO, 'falso.pdf').expect(422)
      expect(corpo<Erro>(resposta)).toMatchObject({ codigo: 'REGRA', mensagem: 'O arquivo não é um PDF.' })
      expect(temporarios()).toEqual(antes)
      expect(await prismaDeTeste().itemBiblioteca.count({ where: { clubeId: clube.id } })).toBe(0)
    })

    it('mais de 50 MB responde 422 com a mensagem do limite, sem sobrar temporario', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const antes = temporarios()
      const grande = Buffer.concat([PDF, Buffer.alloc(50 * MB)])
      const resposta = await enviarItem(adm, { nome: 'Grande', categoriaId: categoria.id }, grande).expect(422)
      expect(corpo<Erro>(resposta)).toMatchObject({ codigo: 'REGRA', mensagem: 'O PDF pode ter até 50 MB.' })
      expect(temporarios()).toEqual(antes)
    })

    it('cota de 2 GB: estourou, 422; item removido libera o espaco', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const ocupante = await itemDireto({
        clubeId: clube.id,
        categoriaId: categoria.id,
        nome: 'Gigante',
        ordem: 1,
        enviadoPorId: adm.usuario.id,
        bytes: COTA_DA_BIBLIOTECA_BYTES - 10,
      })
      const resposta = await enviarItem(adm, { nome: 'Novo', categoriaId: categoria.id }, PDF).expect(422)
      expect(corpo<Erro>(resposta)).toMatchObject({ codigo: 'REGRA', mensagem: 'O espaço da biblioteca do clube acabou.' })
      await prismaDeTeste().itemBiblioteca.update({ where: { id: ocupante.item.id }, data: { removidoEm: new Date() } })
      await enviarItem(adm, { nome: 'Novo', categoriaId: categoria.id }, PDF).expect(201)
    })

    it('dois envios que juntos passam da cota: um aceito, o outro 422, e o recusado nao deixa arquivo no disco', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      await itemDireto({
        clubeId: clube.id,
        categoriaId: categoria.id,
        nome: 'Quase cheio',
        ordem: 1,
        enviadoPorId: adm.usuario.id,
        bytes: COTA_DA_BIBLIOTECA_BYTES - PDF.length - 5,
      })
      const respostas = await Promise.all([
        enviarItem(adm, { nome: 'A', categoriaId: categoria.id }, PDF),
        enviarItem(adm, { nome: 'B', categoriaId: categoria.id }, PDF),
      ])
      expect(respostas.map((resposta) => resposta.status).sort()).toEqual([201, 422])
      expect(await prismaDeTeste().itemBiblioteca.count({ where: { clubeId: clube.id } })).toBe(2)
      expect(await prismaDeTeste().arquivo.count({ where: { clubeId: clube.id } })).toBe(2)
      expect(arquivosDaPasta(clube.id)).toHaveLength(2)
    })

    it('falha depois de gravar o arquivo nao deixa linha nem arquivo no disco', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const original = armazenamento.gravarDeArquivo.bind(armazenamento)
      let caminhoGravado = ''
      const gravar = jest.spyOn(armazenamento, 'gravarDeArquivo').mockImplementationOnce(async (caminho, origem) => {
        await original(caminho, origem)
        caminhoGravado = caminho
        throw new Error('falha depois de gravar')
      })
      try {
        await enviarItem(adm, { nome: 'Falha', categoriaId: categoria.id }, PDF).expect(500)
      } finally {
        gravar.mockRestore()
      }
      expect(caminhoGravado).not.toBe('')
      expect(existeNoDisco(caminhoGravado)).toBe(false)
      expect(await prismaDeTeste().arquivo.count({ where: { clubeId: clube.id } })).toBe(0)
      expect(await prismaDeTeste().itemBiblioteca.count({ where: { clubeId: clube.id } })).toBe(0)
    })

    it('categoria de outro clube ou removida responde 404 e nao grava nada', async () => {
      const { clube, adm } = await cenario()
      const outro = await criarClube()
      const alheia = await categoriaDireta(outro.id, 'Alheia', 1)
      const removida = await categoriaDireta(clube.id, 'Removida', 1, true)
      const antes = temporarios()
      for (const categoriaId of [alheia.id, removida.id]) {
        const resposta = await enviarItem(adm, { nome: 'Livro', categoriaId }, PDF).expect(404)
        expect(corpo<Erro>(resposta).codigo).toBe('NAO_ENCONTRADO')
      }
      expect(temporarios()).toEqual(antes)
      expect(await prismaDeTeste().arquivo.count({ where: { clubeId: clube.id } })).toBe(0)
    })

    it('tira controle e direcao de texto do nome e recusa nome so de espacos', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const item = corpo<ItemBibliotecaSaida>(
        await enviarItem(adm, { nome: 'Livro‮txt.exe', categoriaId: categoria.id }, PDF).expect(201),
      )
      expect(item.nome).toBe('Livrotxt.exe')
      const resposta = await enviarItem(adm, { nome: '   ', categoriaId: categoria.id }, PDF).expect(400)
      expect(corpo<Erro>(resposta).codigo).toBe('VALIDACAO')
    })

    it('sem arquivo, com dados invalidos ou com categoria malformada responde 400', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      await enviarItem(adm, { nome: 'Sem arquivo', categoriaId: categoria.id }, null).expect(400)
      await enviarItem(adm, { nome: 'Categoria ruim', categoriaId: 'nao-e-uuid' }, PDF).expect(400)
      await request(servidor())
        .post('/api/biblioteca/itens')
        .set('Authorization', adm.autorizacao)
        .field('dados', 'isto nao e json')
        .attach('arquivo', PDF, { filename: 'a.pdf' })
        .expect(400)
      expect(await prismaDeTeste().itemBiblioteca.count({ where: { clubeId: clube.id } })).toBe(0)
    })
  })

  describe('capa', () => {
    async function itemPelaApi(adm: Acesso, categoriaId: string, nome = 'Livro'): Promise<ItemBibliotecaSaida> {
      return corpo<ItemBibliotecaSaida>(await enviarItem(adm, { nome, categoriaId }, PDF).expect(201))
    }

    it('imagem valida vira capa: dois arquivos no disco, Arquivo jpeg com miniatura e capaUrl na lista', async () => {
      const { clube, adm, conselheiro } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const item = await itemPelaApi(adm, categoria.id)

      const resposta = await enviarCapa(adm, item.id, await imagem('png')).expect(200)
      expect(corpo<ItemBibliotecaSaida>(resposta).capaUrl).toMatch(/&v=miniatura&/)

      const linha = await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id }, include: { capa: true } })
      expect(linha.capa).toMatchObject({ clubeId: clube.id, mime: 'image/jpeg', criadoPorId: adm.usuario.id })
      expect(linha.capa?.largura).toBeGreaterThan(0)
      expect(linha.capa?.altura).toBeGreaterThan(0)
      expect(linha.capa?.caminho).toBe(`clube/${clube.id}/biblioteca/${linha.capaId}.jpg`)
      expect(linha.capa?.miniaturaCaminho).toBe(`clube/${clube.id}/biblioteca/${linha.capaId}-min.jpg`)
      expect(existeNoDisco(linha.capa?.caminho ?? '')).toBe(true)
      expect(existeNoDisco(linha.capa?.miniaturaCaminho ?? '')).toBe(true)

      const lista = corpo<BibliotecaSaida>(await get(conselheiro, '/api/biblioteca').expect(200))
      expect(lista.categorias[0]?.itens[0]?.capaUrl).toMatch(/&v=miniatura&/)
    })

    it('JPEG e WebP tambem servem de capa', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const item = await itemPelaApi(adm, categoria.id)
      await enviarCapa(adm, item.id, await imagem('jpeg'), 'capa.jpg').expect(200)
      await enviarCapa(adm, item.id, await imagem('webp'), 'capa.webp').expect(200)
    })

    it('arquivo que nao e imagem e recusado (422) e o temporario some', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const item = await itemPelaApi(adm, categoria.id)
      const antes = temporarios()
      const resposta = await enviarCapa(adm, item.id, Buffer.from('so texto'), 'capa.txt').expect(422)
      expect(corpo<Erro>(resposta)).toMatchObject({ codigo: 'REGRA', mensagem: 'A capa precisa ser JPG, PNG ou WebP.' })
      expect(temporarios()).toEqual(antes)
      expect((await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id } })).capaId).toBeNull()
    })

    it('mais de 5 MB responde 422 com a mensagem do limite', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const item = await itemPelaApi(adm, categoria.id)
      const antes = temporarios()
      const resposta = await enviarCapa(adm, item.id, Buffer.alloc(5 * MB + 1024), 'capa.png').expect(422)
      expect(corpo<Erro>(resposta)).toMatchObject({ codigo: 'REGRA', mensagem: 'A capa pode ter até 5 MB.' })
      expect(temporarios()).toEqual(antes)
    })

    it('sem arquivo na capa responde 400', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const item = await itemPelaApi(adm, categoria.id)
      await request(servidor()).put(`/api/biblioteca/itens/${item.id}/capa`).set('Authorization', adm.autorizacao).expect(400)
    })

    it('trocar a capa apaga a linha antiga e os dois arquivos antigos do disco', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const item = await itemPelaApi(adm, categoria.id)
      await enviarCapa(adm, item.id, await imagem('png')).expect(200)
      const antiga = await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id }, include: { capa: true } })

      await enviarCapa(adm, item.id, await imagem('jpeg', 80), 'outra.jpg').expect(200)

      const atual = await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id }, include: { capa: true } })
      expect(atual.capaId).not.toBeNull()
      expect(atual.capaId).not.toBe(antiga.capaId)
      expect(await prismaDeTeste().arquivo.count({ where: { clubeId: clube.id, id: antiga.capaId ?? '' } })).toBe(0)
      expect(existeNoDisco(antiga.capa?.caminho ?? '')).toBe(false)
      expect(existeNoDisco(antiga.capa?.miniaturaCaminho ?? '')).toBe(false)
      expect(existeNoDisco(atual.capa?.caminho ?? '')).toBe(true)
      expect(existeNoDisco(atual.capa?.miniaturaCaminho ?? '')).toBe(true)
    })

    it('tirar a capa limpa o item, apaga a linha e os arquivos; tirar de novo e inofensivo', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const item = await itemPelaApi(adm, categoria.id)
      await enviarCapa(adm, item.id, await imagem('png')).expect(200)
      const antes = await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id }, include: { capa: true } })

      const resposta = await enviar('delete', adm, `/api/biblioteca/itens/${item.id}/capa`).expect(200)
      expect(corpo<ItemBibliotecaSaida>(resposta)).toMatchObject({ id: item.id, capaUrl: null })
      expect((await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id } })).capaId).toBeNull()
      expect(await prismaDeTeste().arquivo.count({ where: { clubeId: clube.id, id: antes.capaId ?? '' } })).toBe(0)
      expect(existeNoDisco(antes.capa?.caminho ?? '')).toBe(false)
      expect(existeNoDisco(antes.capa?.miniaturaCaminho ?? '')).toBe(false)

      await enviar('delete', adm, `/api/biblioteca/itens/${item.id}/capa`).expect(200)
    })

    it('a capa conta na cota e a troca libera a antiga', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const capaGrande = 1_000_000
      const comCapa = await itemDireto({
        clubeId: clube.id,
        categoriaId: categoria.id,
        nome: 'Com capa grande',
        ordem: 1,
        enviadoPorId: adm.usuario.id,
        bytes: 1000,
        capa: { bytes: capaGrande },
      })
      const semCapa = await itemDireto({
        clubeId: clube.id,
        categoriaId: categoria.id,
        nome: 'Sem capa',
        ordem: 2,
        enviadoPorId: adm.usuario.id,
        bytes: COTA_DA_BIBLIOTECA_BYTES - capaGrande - 1000 - 100,
      })

      const recusada = await enviarCapa(adm, semCapa.item.id, await imagem('png', 200)).expect(422)
      expect(corpo<Erro>(recusada)).toMatchObject({ codigo: 'REGRA', mensagem: 'O espaço da biblioteca do clube acabou.' })
      expect((await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: semCapa.item.id } })).capaId).toBeNull()
      expect(arquivosDaPasta(clube.id).filter((nome) => nome.endsWith('.jpg'))).toHaveLength(2)

      await enviarCapa(adm, comCapa.item.id, await imagem('png', 200)).expect(200)
      expect(await prismaDeTeste().arquivo.count({ where: { clubeId: clube.id, id: comCapa.capa?.id ?? '' } })).toBe(0)
    })

    it('item removido, de outro clube ou com id malformado: 404 / 400', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const removido = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'Removido', ordem: 1, enviadoPorId: adm.usuario.id, removido: true })
      await enviarCapa(adm, removido.item.id, await imagem('png')).expect(404)
      await enviarCapa(adm, randomUUID(), await imagem('png')).expect(404)
      const antes = temporarios()
      await enviarCapa(adm, 'nao-e-uuid', await imagem('png')).expect(400)
      expect(temporarios()).toEqual(antes)
    })
  })

  describe('editar item', () => {
    it('renomeia e muda a descricao; limpa descricao com null', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const { item } = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'Antigo', ordem: 1, enviadoPorId: adm.usuario.id })

      const renomeado = corpo<ItemBibliotecaSaida>(
        await enviar('patch', adm, `/api/biblioteca/itens/${item.id}`, { nome: ' Novo nome ', descricao: 'Texto' }).expect(200),
      )
      expect(renomeado).toMatchObject({ id: item.id, nome: 'Novo nome', descricao: 'Texto', categoriaId: categoria.id })

      const limpo = corpo<ItemBibliotecaSaida>(await enviar('patch', adm, `/api/biblioteca/itens/${item.id}`, { descricao: null }).expect(200))
      expect(limpo).toMatchObject({ nome: 'Novo nome', descricao: null })
    })

    it('mudar de categoria leva o item para o fim do destino; a mesma categoria nao mexe na ordem', async () => {
      const { clube, adm } = await cenario()
      const origem = await categoriaDireta(clube.id, 'Origem', 1)
      const destino = await categoriaDireta(clube.id, 'Destino', 2)
      const { item } = await itemDireto({ clubeId: clube.id, categoriaId: origem.id, nome: 'Viajante', ordem: 3, enviadoPorId: adm.usuario.id })
      await itemDireto({ clubeId: clube.id, categoriaId: destino.id, nome: 'Residente', ordem: 5, enviadoPorId: adm.usuario.id })

      await enviar('patch', adm, `/api/biblioteca/itens/${item.id}`, { categoriaId: origem.id }).expect(200)
      expect((await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id } })).ordem).toBe(3)

      const movido = corpo<ItemBibliotecaSaida>(await enviar('patch', adm, `/api/biblioteca/itens/${item.id}`, { categoriaId: destino.id }).expect(200))
      expect(movido.categoriaId).toBe(destino.id)
      expect((await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id } })).ordem).toBe(6)
      const lista = corpo<BibliotecaSaida>(await get(adm, '/api/biblioteca').expect(200))
      expect(lista.categorias.find((categoria) => categoria.id === destino.id)?.itens.map((linha) => linha.nome)).toEqual(['Residente', 'Viajante'])
    })

    it('destino de outro clube ou removido responde 404 e o item fica onde estava', async () => {
      const { clube, adm } = await cenario()
      const origem = await categoriaDireta(clube.id, 'Origem', 1)
      const removida = await categoriaDireta(clube.id, 'Removida', 2, true)
      const outro = await criarClube()
      const alheia = await categoriaDireta(outro.id, 'Alheia', 1)
      const { item } = await itemDireto({ clubeId: clube.id, categoriaId: origem.id, nome: 'Fica', ordem: 1, enviadoPorId: adm.usuario.id })
      for (const categoriaId of [removida.id, alheia.id]) {
        await enviar('patch', adm, `/api/biblioteca/itens/${item.id}`, { categoriaId }).expect(404)
      }
      expect((await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id } })).categoriaId).toBe(origem.id)
    })

    it('item removido responde 404; nome em branco responde 400', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const removido = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'Removido', ordem: 1, enviadoPorId: adm.usuario.id, removido: true })
      const ativo = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'Ativo', ordem: 2, enviadoPorId: adm.usuario.id })
      await enviar('patch', adm, `/api/biblioteca/itens/${removido.item.id}`, { nome: 'Outro' }).expect(404)
      await enviar('patch', adm, `/api/biblioteca/itens/${ativo.item.id}`, { nome: '   ' }).expect(400)
      await enviar('patch', adm, '/api/biblioteca/itens/nao-e-uuid', { nome: 'x' }).expect(400)
    })
  })

  describe('mover', () => {
    const ordemDoItem = async (id: string): Promise<number> => (await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id } })).ordem
    const ordemDaCategoria = async (id: string): Promise<number> => (await prismaDeTeste().categoriaBiblioteca.findUniqueOrThrow({ where: { id } })).ordem

    it('item troca de lugar com o vizinho ativo, pulando o removido', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const dono = adm.usuario.id
      const a = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'A', ordem: 1, enviadoPorId: dono })
      const removido = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'R', ordem: 2, enviadoPorId: dono, removido: true })
      const c = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'C', ordem: 3, enviadoPorId: dono })

      await enviar('post', adm, `/api/biblioteca/itens/${c.item.id}/mover`, { direcao: 'acima' }).expect(204)
      expect(await ordemDoItem(c.item.id)).toBe(1)
      expect(await ordemDoItem(a.item.id)).toBe(3)
      expect(await ordemDoItem(removido.item.id)).toBe(2)

      await enviar('post', adm, `/api/biblioteca/itens/${c.item.id}/mover`, { direcao: 'abaixo' }).expect(204)
      expect(await ordemDoItem(c.item.id)).toBe(3)
      expect(await ordemDoItem(a.item.id)).toBe(1)
    })

    it('no topo "acima" e no fim "abaixo" nao mudam nada (204)', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const a = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'A', ordem: 1, enviadoPorId: adm.usuario.id })
      const b = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'B', ordem: 2, enviadoPorId: adm.usuario.id })
      await enviar('post', adm, `/api/biblioteca/itens/${a.item.id}/mover`, { direcao: 'acima' }).expect(204)
      await enviar('post', adm, `/api/biblioteca/itens/${b.item.id}/mover`, { direcao: 'abaixo' }).expect(204)
      expect([await ordemDoItem(a.item.id), await ordemDoItem(b.item.id)]).toEqual([1, 2])
    })

    it('duas trocas simultaneas na mesma categoria nao repetem a ordem', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const dono = adm.usuario.id
      await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'A', ordem: 1, enviadoPorId: dono })
      const b = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'B', ordem: 2, enviadoPorId: dono })
      const c = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'C', ordem: 3, enviadoPorId: dono })
      const respostas = await Promise.all([
        enviar('post', adm, `/api/biblioteca/itens/${c.item.id}/mover`, { direcao: 'acima' }),
        enviar('post', adm, `/api/biblioteca/itens/${b.item.id}/mover`, { direcao: 'acima' }),
      ])
      expect(respostas.map((resposta) => resposta.status)).toEqual([204, 204])
      expect(await ordensDe(clube.id, categoria.id)).toEqual([1, 2, 3])
    })

    it('item removido ou direcao invalida: 404 / 400', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const removido = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'R', ordem: 1, enviadoPorId: adm.usuario.id, removido: true })
      const ativo = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'A', ordem: 2, enviadoPorId: adm.usuario.id })
      await enviar('post', adm, `/api/biblioteca/itens/${removido.item.id}/mover`, { direcao: 'acima' }).expect(404)
      await enviar('post', adm, `/api/biblioteca/itens/${ativo.item.id}/mover`, { direcao: 'de lado' }).expect(400)
    })

    it('categoria troca com a vizinha ativa, pula a removida, e nas pontas nao muda nada', async () => {
      const { clube, adm } = await cenario()
      const a = await categoriaDireta(clube.id, 'A', 1)
      const removida = await categoriaDireta(clube.id, 'R', 2, true)
      const c = await categoriaDireta(clube.id, 'C', 3)

      await enviar('post', adm, `/api/biblioteca/categorias/${c.id}/mover`, { direcao: 'acima' }).expect(204)
      expect([await ordemDaCategoria(c.id), await ordemDaCategoria(a.id), await ordemDaCategoria(removida.id)]).toEqual([1, 3, 2])
      const lista = corpo<BibliotecaSaida>(await get(adm, '/api/biblioteca').expect(200))
      expect(lista.categorias.map((categoria) => categoria.nome)).toEqual(['C', 'A'])

      await enviar('post', adm, `/api/biblioteca/categorias/${c.id}/mover`, { direcao: 'acima' }).expect(204)
      await enviar('post', adm, `/api/biblioteca/categorias/${a.id}/mover`, { direcao: 'abaixo' }).expect(204)
      expect([await ordemDaCategoria(c.id), await ordemDaCategoria(a.id)]).toEqual([1, 3])
    })

    it('duas trocas simultaneas de categoria nao repetem a ordem', async () => {
      const { clube, adm } = await cenario()
      await categoriaDireta(clube.id, 'A', 1)
      const b = await categoriaDireta(clube.id, 'B', 2)
      const c = await categoriaDireta(clube.id, 'C', 3)
      await Promise.all([
        enviar('post', adm, `/api/biblioteca/categorias/${c.id}/mover`, { direcao: 'acima' }).expect(204),
        enviar('post', adm, `/api/biblioteca/categorias/${b.id}/mover`, { direcao: 'acima' }).expect(204),
      ])
      const ordens = (await prismaDeTeste().categoriaBiblioteca.findMany({ where: { clubeId: clube.id }, select: { ordem: true } }))
        .map((linha) => linha.ordem)
        .sort((x, y) => x - y)
      expect(ordens).toEqual([1, 2, 3])
    })
  })

  describe('remover item', () => {
    it('some da lista, apaga PDF e capa do disco, a URL antiga passa a responder 404 e a cota libera', async () => {
      const { clube, adm, conselheiro } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const item = corpo<ItemBibliotecaSaida>(await enviarItem(adm, { nome: 'Livro', categoriaId: categoria.id }, PDF).expect(201))
      await enviarCapa(adm, item.id, await imagem('png')).expect(200)
      const linha = await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id }, include: { arquivo: true, capa: true } })
      const caminhos = [linha.arquivo.caminho, linha.capa?.caminho ?? '', linha.capa?.miniaturaCaminho ?? '']
      expect(caminhos.map(existeNoDisco)).toEqual([true, true, true])
      const antes = corpo<BibliotecaSaida>(await get(conselheiro, '/api/biblioteca').expect(200))
      const urlAntiga = antes.categorias[0]?.itens[0]?.urlLer ?? ''
      await request(servidor()).get(urlAntiga).expect(200)

      await enviar('delete', adm, `/api/biblioteca/itens/${item.id}`).expect(204)

      const depois = corpo<BibliotecaSaida>(await get(conselheiro, '/api/biblioteca').expect(200))
      expect(depois.categorias[0]?.itens).toEqual([])
      expect(caminhos.map(existeNoDisco)).toEqual([false, false, false])
      await request(servidor()).get(urlAntiga).expect(404)
      const removido = await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id } })
      expect(removido.removidoEm).not.toBeNull()
      expect(removido.removidoPorId).toBe(adm.usuario.id)
      expect(await prismaDeTeste().arquivo.count({ where: { clubeId: clube.id, id: linha.arquivoId } })).toBe(1)
    })

    it('o espaco do item removido volta para a cota', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const ocupante = await itemDireto({
        clubeId: clube.id,
        categoriaId: categoria.id,
        nome: 'Gigante',
        ordem: 1,
        enviadoPorId: adm.usuario.id,
        bytes: COTA_DA_BIBLIOTECA_BYTES - 10,
      })
      await enviarItem(adm, { nome: 'Novo', categoriaId: categoria.id }, PDF).expect(422)
      await enviar('delete', adm, `/api/biblioteca/itens/${ocupante.item.id}`).expect(204)
      await enviarItem(adm, { nome: 'Novo', categoriaId: categoria.id }, PDF).expect(201)
    })

    it('remover duas vezes responde 404', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Livros', 1)
      const { item } = await itemDireto({ clubeId: clube.id, categoriaId: categoria.id, nome: 'Livro', ordem: 1, enviadoPorId: adm.usuario.id })
      await enviar('delete', adm, `/api/biblioteca/itens/${item.id}`).expect(204)
      await enviar('delete', adm, `/api/biblioteca/itens/${item.id}`).expect(404)
    })
  })

  describe('categorias', () => {
    it('cria no fim e devolve a categoria sem itens', async () => {
      const { clube, adm } = await cenario()
      await categoriaDireta(clube.id, 'Primeira', 4)
      await categoriaDireta(clube.id, 'Removida', 9, true)
      const criada = corpo<CategoriaBibliotecaSaida>(await enviar('post', adm, '/api/biblioteca/categorias', { nome: '  Revistas  ' }).expect(201))
      expect(criada).toMatchObject({ nome: 'Revistas', itens: [] })
      const lista = corpo<BibliotecaSaida>(await get(adm, '/api/biblioteca').expect(200))
      expect(lista.categorias.map((categoria) => categoria.nome)).toEqual(['Primeira', 'Revistas'])
      expect((await prismaDeTeste().categoriaBiblioteca.findUniqueOrThrow({ where: { id: criada.id } })).ordem).toBe(5)
    })

    it('nome repetido (maiusculas diferentes) responde 422; nome de categoria removida pode ser reusado', async () => {
      const { clube, adm } = await cenario()
      await categoriaDireta(clube.id, 'Livros', 1)
      await categoriaDireta(clube.id, 'Antiga', 2, true)
      const repetida = await enviar('post', adm, '/api/biblioteca/categorias', { nome: 'LIVROS' }).expect(422)
      expect(corpo<Erro>(repetida)).toMatchObject({ codigo: 'REGRA', mensagem: 'Já existe uma categoria com esse nome.' })
      await enviar('post', adm, '/api/biblioteca/categorias', { nome: 'antiga' }).expect(201)
      await enviar('post', adm, '/api/biblioteca/categorias', { nome: '   ' }).expect(400)
      await enviar('post', adm, '/api/biblioteca/categorias', { nome: 'x'.repeat(61) }).expect(400)
    })

    it('o mesmo nome em outro clube nao conflita', async () => {
      const { adm } = await cenario()
      const outro = await cenario()
      await categoriaDireta(outro.clube.id, 'Livros', 1)
      await enviar('post', adm, '/api/biblioteca/categorias', { nome: 'Livros' }).expect(201)
    })

    it('renomeia; trocar so as maiusculas do proprio nome passa, mas o nome de outra categoria ativa nao', async () => {
      const { clube, adm } = await cenario()
      const livros = await categoriaDireta(clube.id, 'Livros', 1)
      await categoriaDireta(clube.id, 'Manuais', 2)
      const renomeada = corpo<CategoriaBibliotecaSaida>(await enviar('patch', adm, `/api/biblioteca/categorias/${livros.id}`, { nome: 'LIVROS' }).expect(200))
      expect(renomeada).toMatchObject({ id: livros.id, nome: 'LIVROS' })
      const conflito = await enviar('patch', adm, `/api/biblioteca/categorias/${livros.id}`, { nome: 'manuais' }).expect(422)
      expect(corpo<Erro>(conflito).mensagem).toBe('Já existe uma categoria com esse nome.')
      await enviar('patch', adm, `/api/biblioteca/categorias/${livros.id}`, { nome: '' }).expect(400)
    })

    it('renomear traz os itens da categoria na resposta', async () => {
      const { clube, adm } = await cenario()
      const livros = await categoriaDireta(clube.id, 'Livros', 1)
      await itemDireto({ clubeId: clube.id, categoriaId: livros.id, nome: 'Amigo', ordem: 1, enviadoPorId: adm.usuario.id })
      const renomeada = corpo<CategoriaBibliotecaSaida>(await enviar('patch', adm, `/api/biblioteca/categorias/${livros.id}`, { nome: 'Cadernos' }).expect(200))
      expect(renomeada.itens.map((item) => item.nome)).toEqual(['Amigo'])
    })

    it('excluir com item ativo responde 422; vazia (ou so com item removido) exclui e guarda quem e quando', async () => {
      const { clube, adm } = await cenario()
      const cheia = await categoriaDireta(clube.id, 'Cheia', 1)
      const vazia = await categoriaDireta(clube.id, 'Vazia', 2)
      await itemDireto({ clubeId: clube.id, categoriaId: cheia.id, nome: 'Ativo', ordem: 1, enviadoPorId: adm.usuario.id })
      await itemDireto({ clubeId: clube.id, categoriaId: vazia.id, nome: 'Removido', ordem: 1, enviadoPorId: adm.usuario.id, removido: true })

      const recusada = await enviar('delete', adm, `/api/biblioteca/categorias/${cheia.id}`).expect(422)
      expect(corpo<Erro>(recusada)).toMatchObject({ codigo: 'REGRA', mensagem: 'Tire os itens da categoria antes de excluí-la.' })
      expect((await prismaDeTeste().categoriaBiblioteca.findUniqueOrThrow({ where: { id: cheia.id } })).removidaEm).toBeNull()

      await enviar('delete', adm, `/api/biblioteca/categorias/${vazia.id}`).expect(204)
      const removida = await prismaDeTeste().categoriaBiblioteca.findUniqueOrThrow({ where: { id: vazia.id } })
      expect(removida.removidaEm).not.toBeNull()
      expect(removida.removidaPorId).toBe(adm.usuario.id)
      const lista = corpo<BibliotecaSaida>(await get(adm, '/api/biblioteca').expect(200))
      expect(lista.categorias.map((categoria) => categoria.nome)).toEqual(['Cheia'])

      await enviar('delete', adm, `/api/biblioteca/categorias/${vazia.id}`).expect(404)
    })

    it('excluir a categoria e adicionar item nela ao mesmo tempo nunca deixa item ativo em categoria removida', async () => {
      const { clube, adm } = await cenario()
      const categoria = await categoriaDireta(clube.id, 'Corrida', 1)
      const [exclusao, envio] = await Promise.all([
        enviar('delete', adm, `/api/biblioteca/categorias/${categoria.id}`),
        enviarItem(adm, { nome: 'Novo', categoriaId: categoria.id }, PDF),
      ])
      expect(`${exclusao.status}/${envio.status}`).toMatch(/^(204\/404|422\/201)$/)
      const final = await prismaDeTeste().categoriaBiblioteca.findUniqueOrThrow({ where: { id: categoria.id } })
      const ativos = await prismaDeTeste().itemBiblioteca.count({ where: { clubeId: clube.id, categoriaId: categoria.id, removidoEm: null } })
      expect(final.removidaEm !== null && ativos > 0).toBe(false)
      if (envio.status === 404) expect(arquivosDaPasta(clube.id)).toHaveLength(0)
    })

    it('categoria de outro clube, id desconhecido ou malformado: 404 / 400', async () => {
      const { adm } = await cenario()
      await enviar('patch', adm, `/api/biblioteca/categorias/${randomUUID()}`, { nome: 'X' }).expect(404)
      await enviar('post', adm, `/api/biblioteca/categorias/${randomUUID()}/mover`, { direcao: 'acima' }).expect(404)
      await enviar('delete', adm, `/api/biblioteca/categorias/${randomUUID()}`).expect(404)
      await enviar('patch', adm, '/api/biblioteca/categorias/nao-e-uuid', { nome: 'X' }).expect(400)
    })
  })

  describe('isolamento entre clubes', () => {
    const dono = async () => (await criarUsuario()).id

    const categoriaEItem = async (clubeId: string, comCapa = false) => {
      const enviadoPorId = await dono()
      const categoria = await categoriaDireta(clubeId, 'Livros', 1)
      const alvo = await itemDireto({
        clubeId,
        categoriaId: categoria.id,
        nome: 'Do outro clube',
        ordem: 1,
        enviadoPorId,
        capa: comCapa ? { bytes: 500 } : undefined,
      })
      return { categoria, ...alvo }
    }

    testarIsolamento({
      titulo: 'GET /biblioteca',
      app: doApp,
      papel: 'CONSELHEIRO',
      semear: async (clube) => {
        const { item, categoria } = await categoriaEItem(clube.id)
        return { metodo: 'get', caminho: '/api/biblioteca', idsDoOutroClube: [item.id, categoria.id] }
      },
      esperado: { tipo: 'LISTA_SEM_OS_IDS' },
    })

    testarIsolamento({
      titulo: 'PATCH /biblioteca/itens/:id',
      app: doApp,
      papel: 'ADM',
      semear: async (clube) => {
        const { item } = await categoriaEItem(clube.id)
        return {
          metodo: 'patch',
          caminho: `/api/biblioteca/itens/${item.id}`,
          corpo: { nome: 'Invadido' },
          conferirIntacto: async () => {
            expect((await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id } })).nome).toBe('Do outro clube')
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'POST /biblioteca/itens/:id/mover',
      app: doApp,
      papel: 'ADM',
      semear: async (clube) => {
        const { item } = await categoriaEItem(clube.id)
        return { metodo: 'post', caminho: `/api/biblioteca/itens/${item.id}/mover`, corpo: { direcao: 'abaixo' } }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'PUT /biblioteca/itens/:id/capa',
      app: doApp,
      papel: 'ADM',
      semear: async (clube) => {
        const { item } = await categoriaEItem(clube.id)
        return {
          metodo: 'put',
          caminho: `/api/biblioteca/itens/${item.id}/capa`,
          anexos: { arquivos: [{ campo: 'capa', conteudo: await imagem('png'), nome: 'capa.png', tipo: 'image/png' }] },
          conferirIntacto: async () => {
            expect((await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id } })).capaId).toBeNull()
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'DELETE /biblioteca/itens/:id/capa',
      app: doApp,
      papel: 'ADM',
      semear: async (clube) => {
        const { item, capa } = await categoriaEItem(clube.id, true)
        return {
          metodo: 'delete',
          caminho: `/api/biblioteca/itens/${item.id}/capa`,
          conferirIntacto: async () => {
            expect((await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id } })).capaId).toBe(capa?.id)
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'DELETE /biblioteca/itens/:id',
      app: doApp,
      papel: 'ADM',
      semear: async (clube) => {
        const { item } = await categoriaEItem(clube.id)
        return {
          metodo: 'delete',
          caminho: `/api/biblioteca/itens/${item.id}`,
          conferirIntacto: async () => {
            expect((await prismaDeTeste().itemBiblioteca.findUniqueOrThrow({ where: { id: item.id } })).removidoEm).toBeNull()
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'PATCH /biblioteca/categorias/:id',
      app: doApp,
      papel: 'ADM',
      semear: async (clube) => {
        const { categoria } = await categoriaEItem(clube.id)
        return {
          metodo: 'patch',
          caminho: `/api/biblioteca/categorias/${categoria.id}`,
          corpo: { nome: 'Invadida' },
          conferirIntacto: async () => {
            expect((await prismaDeTeste().categoriaBiblioteca.findUniqueOrThrow({ where: { id: categoria.id } })).nome).toBe('Livros')
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'POST /biblioteca/categorias/:id/mover',
      app: doApp,
      papel: 'ADM',
      semear: async (clube) => {
        const { categoria } = await categoriaEItem(clube.id)
        return { metodo: 'post', caminho: `/api/biblioteca/categorias/${categoria.id}/mover`, corpo: { direcao: 'abaixo' } }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'DELETE /biblioteca/categorias/:id',
      app: doApp,
      papel: 'ADM',
      semear: async (clube) => {
        const categoria = await categoriaDireta(clube.id, 'Vazia', 1)
        return {
          metodo: 'delete',
          caminho: `/api/biblioteca/categorias/${categoria.id}`,
          conferirIntacto: async () => {
            expect((await prismaDeTeste().categoriaBiblioteca.findUniqueOrThrow({ where: { id: categoria.id } })).removidaEm).toBeNull()
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    it('POST /biblioteca/itens com categoria do outro clube responde 404 e nao cria item la', async () => {
      const { adm } = await cenario()
      const outro = await criarClube()
      const { categoria } = await categoriaEItem(outro.id)
      await enviarItem(adm, { nome: 'Invasor', categoriaId: categoria.id }, PDF).expect(404)
      expect(await prismaDeTeste().itemBiblioteca.count({ where: { clubeId: outro.id } })).toBe(1)
    })
  })
})
