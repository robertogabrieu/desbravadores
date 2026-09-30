import { readdirSync } from 'node:fs'
import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type { MaterialSaida } from '@desbravadores/shared'
import request from 'supertest'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarArquivo,
  criarClube,
  criarMaterial,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  type Acesso,
} from '../../test/fabricas'
import { clienteHttp, corpo, criarClasseDoClube } from '../../test/p6'
import { ARMAZENAMENTO, type Armazenamento } from '../arquivos/armazenamento'
import { COTA_DE_MATERIAIS_BYTES } from './materiais.service'
import { LimpezaDeMateriais } from './limpeza-de-materiais'
import { PASTA_TEMPORARIA_DE_MATERIAIS } from './materiais.controller'

type Saida = z.infer<typeof MaterialSaida>

const MIME_ODT = 'application/vnd.oasis.opendocument.text'

/** ZIP minimo, sem compressao e sem CRC valido: so o diretorio importa para a conferencia. */
function zip(entradas: { nome: string; conteudo?: string }[]): Buffer {
  const locais: Buffer[] = []
  const diretorio: Buffer[] = []
  let posicao = 0
  for (const { nome, conteudo = '' } of entradas) {
    const nomeBytes = Buffer.from(nome)
    const dados = Buffer.from(conteudo)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt32LE(dados.length, 18)
    local.writeUInt32LE(dados.length, 22)
    local.writeUInt16LE(nomeBytes.length, 26)
    locais.push(local, nomeBytes, dados)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt32LE(dados.length, 20)
    central.writeUInt32LE(dados.length, 24)
    central.writeUInt16LE(nomeBytes.length, 28)
    central.writeUInt32LE(posicao, 42)
    diretorio.push(central, nomeBytes)
    posicao += local.length + nomeBytes.length + dados.length
  }
  const centralBytes = Buffer.concat(diretorio)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(entradas.length, 8)
  fim.writeUInt16LE(entradas.length, 10)
  fim.writeUInt32LE(centralBytes.length, 12)
  fim.writeUInt32LE(posicao, 16)
  return Buffer.concat([...locais, centralBytes, fim])
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

describe('materiais (F9)', () => {
  let app: INestApplication
  let armazenamento: Armazenamento
  const api = clienteHttp(() => app)
  const servidor = (): Server => app.getHttpServer() as Server

  beforeAll(async () => {
    app = await criarAppDeTeste()
    armazenamento = app.get<Armazenamento>(ARMAZENAMENTO)
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  async function cenario() {
    const clube = await criarClube()
    const classe = await criarClasseDoClube(clube.id)
    const autor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
    const colega = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const secao = await prismaDeTeste().secaoRequisito.create({ data: { classeId: classe.id, codigo: 'A', nome: 'Secao A', ordem: 1 } })
    return { clube, classe, autor, colega, adm, secao }
  }

  function enviar(acesso: Acesso, classeId: string, arquivo: Buffer, nome: string, extras: { secaoId?: string | null; titulo?: string } = {}): request.Test {
    return request(servidor())
      .post('/api/materiais/arquivo')
      .set('Authorization', acesso.autorizacao)
      .field('dados', JSON.stringify({ classeId, secaoId: extras.secaoId ?? null, titulo: extras.titulo ?? 'Material' }))
      .attach('arquivo', arquivo, { filename: nome })
  }

  const existeNoDisco = (caminho: string): boolean => {
    try {
      armazenamento.abrir(caminho).destroy()
      return true
    } catch {
      return false
    }
  }

  const temporarios = (): string[] => {
    try {
      return readdirSync(PASTA_TEMPORARIA_DE_MATERIAIS)
    } catch {
      return []
    }
  }

  it('PDF real e aceito: grava no disco, tipo e mime da tabela, URL assinada', async () => {
    const { clube, classe, autor, secao } = await cenario()
    const material = corpo<Saida>(await enviar(autor, classe.id, PDF, 'Licao 1.PDF', { secaoId: secao.id, titulo: 'Licao 1' }).expect(201))
    expect(material).toMatchObject({ titulo: 'Licao 1', tipo: 'PDF', bytes: PDF.length, podeEditar: true, secao: { id: secao.id, codigo: 'A' } })
    expect(material.url).toMatch(/^\/api\/arquivos\/.+&v=original&/)
    const linha = await prismaDeTeste().material.findUniqueOrThrow({ where: { id: material.id }, include: { arquivo: true } })
    expect(linha.arquivo).toMatchObject({ clubeId: clube.id, mime: 'application/pdf', bytes: PDF.length })
    expect(linha.arquivo?.caminho).toMatch(new RegExp(`^clube/${clube.id}/materiais/\\d{4}/[0-9a-f-]+\\.pdf$`))
    expect(existeNoDisco(linha.arquivo?.caminho ?? '')).toBe(true)
  })

  it('PNG com extensao .pdf e recusado (422) e o temporario some', async () => {
    const { classe, autor } = await cenario()
    const antes = temporarios()
    const resposta = await enviar(autor, classe.id, PNG, 'falso.pdf').expect(422)
    expect(corpo<{ codigo: string }>(resposta).codigo).toBe('REGRA')
    expect(temporarios()).toEqual(antes)
  })

  it('DOCX: ZIP com word/document.xml passa; ZIP qualquer com .docx e o PPTX renomeado nao', async () => {
    const { classe, autor } = await cenario()
    const docx = zip([{ nome: '[Content_Types].xml' }, { nome: 'word/document.xml', conteudo: '<w/>' }])
    expect(corpo<Saida>(await enviar(autor, classe.id, docx, 'a.docx').expect(201)).tipo).toBe('DOCUMENTO')
    await enviar(autor, classe.id, zip([{ nome: 'qualquer.txt', conteudo: 'oi' }]), 'b.docx').expect(422)
    const pptx = zip([{ nome: 'ppt/presentation.xml' }])
    await enviar(autor, classe.id, pptx, 'c.docx').expect(422)
    expect(corpo<Saida>(await enviar(autor, classe.id, pptx, 'c.pptx').expect(201)).tipo).toBe('APRESENTACAO')
  })

  it('ODT/ODP: mimetype ODF certo passa; mimetype errado ou ausente nao; .doc antigo e recusado', async () => {
    const { classe, autor } = await cenario()
    const odt = zip([{ nome: 'mimetype', conteudo: MIME_ODT }, { nome: 'content.xml' }])
    expect(corpo<Saida>(await enviar(autor, classe.id, odt, 'a.odt').expect(201)).tipo).toBe('DOCUMENTO')
    await enviar(autor, classe.id, odt, 'a.odp').expect(422)
    await enviar(autor, classe.id, zip([{ nome: 'mimetype', conteudo: 'text/plain' }]), 'b.odt').expect(422)
    await enviar(autor, classe.id, zip([{ nome: 'content.xml' }]), 'c.odt').expect(422)
    await enviar(autor, classe.id, PDF, 'antigo.doc').expect(422)
  })

  it('mais de 20 MB responde 422 com a mensagem do limite, sem sobrar temporario', async () => {
    const { classe, autor } = await cenario()
    const antes = temporarios()
    const grande = Buffer.concat([PDF, Buffer.alloc(20 * 1024 * 1024)])
    const resposta = await enviar(autor, classe.id, grande, 'grande.pdf').expect(422)
    expect(corpo<{ mensagem: string }>(resposta).mensagem).toBe('O arquivo precisa ter até 20 MB.')
    expect(temporarios()).toEqual(antes)
  })

  it('cota de 1 GB por clube: estourou, 422; material apagado libera o espaco', async () => {
    const { clube, classe, autor } = await cenario()
    const cheio = await criarArquivo({ clubeId: clube.id, criadoPorId: autor.usuario.id, mime: 'application/pdf', bytes: COTA_DE_MATERIAIS_BYTES - 10, miniaturaCaminho: null })
    const ocupante = await criarMaterial({ clubeId: clube.id, classeId: classe.id, autorId: autor.usuario.id, titulo: 'Grande', arquivo: cheio.id })
    const resposta = await enviar(autor, classe.id, PDF, 'a.pdf').expect(422)
    expect(corpo<{ mensagem: string }>(resposta).mensagem).toBe('O espaço de materiais do clube acabou.')
    await prismaDeTeste().material.update({ where: { id: ocupante.id }, data: { removidoEm: new Date() } })
    await enviar(autor, classe.id, PDF, 'a.pdf').expect(201)
  })

  it('dois envios simultaneos que juntos passam da cota: um aceito, o outro 422', async () => {
    const { clube, classe, autor } = await cenario()
    const cheio = await criarArquivo({ clubeId: clube.id, criadoPorId: autor.usuario.id, mime: 'application/pdf', bytes: COTA_DE_MATERIAIS_BYTES - PDF.length - 5, miniaturaCaminho: null })
    await criarMaterial({ clubeId: clube.id, classeId: classe.id, autorId: autor.usuario.id, titulo: 'Grande', arquivo: cheio.id })
    const respostas = await Promise.all([enviar(autor, classe.id, PDF, 'a.pdf'), enviar(autor, classe.id, PDF, 'b.pdf')])
    expect(respostas.map((r) => r.status).sort()).toEqual([201, 422])
    const recusada = respostas.find((r) => r.status === 422)
    expect(corpo<{ mensagem: string }>(recusada as request.Response).mensagem).toBe('O espaço de materiais do clube acabou.')
    expect(await prismaDeTeste().material.count({ where: { clubeId: clube.id } })).toBe(2)
  })

  it('o id do arquivo e UUID v7 e o arquivo em disco usa esse id', async () => {
    const { classe, autor } = await cenario()
    const material = corpo<Saida>(await enviar(autor, classe.id, PDF, 'v7.pdf').expect(201))
    const linha = await prismaDeTeste().material.findUniqueOrThrow({ where: { id: material.id }, include: { arquivo: true } })
    expect(linha.arquivoId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(linha.arquivo?.caminho.endsWith(`/${linha.arquivoId}.pdf`)).toBe(true)
    expect(existeNoDisco(linha.arquivo?.caminho ?? '')).toBe(true)
  })

  it('falha depois de gravar o arquivo nao deixa linha nem arquivo no disco', async () => {
    const { clube, classe, autor } = await cenario()
    const original = armazenamento.gravarDeArquivo.bind(armazenamento)
    let caminhoGravado = ''
    const gravar = jest.spyOn(armazenamento, 'gravarDeArquivo').mockImplementationOnce(async (caminho, origem) => {
      await original(caminho, origem)
      caminhoGravado = caminho
      throw new Error('falha depois de gravar')
    })
    try {
      await enviar(autor, classe.id, PDF, 'falha.pdf').expect(500)
    } finally {
      gravar.mockRestore()
    }
    expect(caminhoGravado).not.toBe('')
    expect(existeNoDisco(caminhoGravado)).toBe(false)
    expect(await prismaDeTeste().arquivo.count({ where: { clubeId: clube.id } })).toBe(0)
    expect(await prismaDeTeste().material.count({ where: { clubeId: clube.id } })).toBe(0)
  })

  it('a trava do clube nao cobre a copia: com a copia de um envio lenta, outro envio do mesmo clube conclui antes', async () => {
    const { classe, autor } = await cenario()
    const original = armazenamento.gravarDeArquivo.bind(armazenamento)
    let copiaIniciada: () => void = () => undefined
    const iniciou = new Promise<void>((resolver) => {
      copiaIniciada = resolver
    })
    const gravar = jest.spyOn(armazenamento, 'gravarDeArquivo').mockImplementationOnce(async (caminho, origem) => {
      copiaIniciada()
      await new Promise((resolver) => setTimeout(resolver, 1500))
      await original(caminho, origem)
    })
    try {
      const lento = enviar(autor, classe.id, PDF, 'lento.pdf', { titulo: 'Lento' }).then((r) => ({ r, fim: Date.now() }))
      await iniciou
      const rapido = await enviar(autor, classe.id, PDF, 'rapido.pdf', { titulo: 'Rapido' }).expect(201)
      const fimDoRapido = Date.now()
      const resultadoLento = await lento
      expect(resultadoLento.r.status).toBe(201)
      expect(fimDoRapido).toBeLessThan(resultadoLento.fim)
      expect(corpo<Saida>(rapido).titulo).toBe('Rapido')
    } finally {
      gravar.mockRestore()
    }
  })

  it('link so https; http recusado (400)', async () => {
    const { classe, autor } = await cenario()
    const ok = corpo<Saida>(await api.post('/api/materiais/link', autor.autorizacao, { classeId: classe.id, secaoId: null, titulo: 'Video', url: 'https://exemplo.test/v' }).expect(201))
    expect(ok).toMatchObject({ tipo: 'LINK', url: 'https://exemplo.test/v', bytes: null })
    await api.post('/api/materiais/link', autor.autorizacao, { classeId: classe.id, secaoId: null, titulo: 'Video', url: 'http://exemplo.test/v' }).expect(400)
  })

  it('apagar remove o arquivo do disco depois de marcar; a limpeza da subida termina o que sobrou', async () => {
    const { classe, autor, clube } = await cenario()
    const material = corpo<Saida>(await enviar(autor, classe.id, PDF, 'a.pdf').expect(201))
    const { arquivo } = await prismaDeTeste().material.findUniqueOrThrow({ where: { id: material.id }, include: { arquivo: true } })
    const caminho = arquivo?.caminho ?? ''
    expect(existeNoDisco(caminho)).toBe(true)
    await request(servidor()).delete(`/api/materiais/${material.id}`).set('Authorization', autor.autorizacao).expect(204)
    expect(existeNoDisco(caminho)).toBe(false)
    expect((await prismaDeTeste().material.findUniqueOrThrow({ where: { id: material.id } })).removidoEm).not.toBeNull()

    const sobra = await criarArquivo({ clubeId: clube.id, criadoPorId: autor.usuario.id, caminho: `clube/${clube.id}/materiais/2026/sobra.pdf`, mime: 'application/pdf', miniaturaCaminho: null })
    await armazenamento.gravar(sobra.caminho, PDF)
    await prismaDeTeste().material.create({
      data: { clubeId: clube.id, classeId: classe.id, titulo: 'Sobra', tipo: 'PDF', arquivoId: sobra.id, enviadoPorId: autor.usuario.id, removidoEm: new Date() },
    })
    await app.get(LimpezaDeMateriais, { strict: false }).limpar()
    expect(existeNoDisco(sobra.caminho)).toBe(false)
  })

  it('lista por secao do caderno e depois sem secao; renomear e mover so autor ou Adm; outro instrutor 403', async () => {
    const { clube, classe, autor, colega, adm, secao } = await cenario()
    const outraClasse = await criarClasseDoClube(clube.id, 'Outra')
    const secaoDeFora = await prismaDeTeste().secaoRequisito.create({ data: { classeId: outraClasse.id, codigo: 'Z', nome: 'Z', ordem: 1 } })
    const semSecao = await criarMaterial({ clubeId: clube.id, classeId: classe.id, autorId: autor.usuario.id, titulo: 'Sem secao' })
    const daSecao = await criarMaterial({ clubeId: clube.id, classeId: classe.id, autorId: autor.usuario.id, titulo: 'Da secao', secaoId: secao.id })
    const removido = await criarMaterial({ clubeId: clube.id, classeId: classe.id, autorId: autor.usuario.id, titulo: 'Removido' })
    await prismaDeTeste().material.update({ where: { id: removido.id }, data: { removidoEm: new Date() } })

    const materiais = corpo<Saida[]>(await api.get(`/api/classes/${classe.id}/materiais`, colega.autorizacao).expect(200))
    expect(materiais.map((m) => m.id)).toEqual([daSecao.id, semSecao.id])
    expect(materiais.map((m) => m.podeEditar)).toEqual([false, false])

    await api.patch(`/api/materiais/${semSecao.id}`, colega.autorizacao, { titulo: 'x' }).expect(403)
    await request(servidor()).delete(`/api/materiais/${semSecao.id}`).set('Authorization', colega.autorizacao).expect(403)
    const movido = corpo<Saida>(await api.patch(`/api/materiais/${semSecao.id}`, autor.autorizacao, { titulo: 'Novo', secaoId: secao.id }).expect(200))
    expect(movido).toMatchObject({ titulo: 'Novo', secao: { id: secao.id } })
    await api.patch(`/api/materiais/${semSecao.id}`, autor.autorizacao, { secaoId: secaoDeFora.id }).expect(404)
    expect(corpo<Saida>(await api.patch(`/api/materiais/${semSecao.id}`, adm.autorizacao, { secaoId: null }).expect(200)).secao).toBeNull()
    await request(servidor()).delete(`/api/materiais/${semSecao.id}`).set('Authorization', adm.autorizacao).expect(204)
    await api.patch(`/api/materiais/${semSecao.id}`, adm.autorizacao, { titulo: 'x' }).expect(404)
  })

  it('escopo: classe fora do vinculo e outro clube 404; conselheiro 403; secao de outra classe 404 no envio', async () => {
    const { clube, classe, autor, secao } = await cenario()
    const outraClasse = await criarClasseDoClube(clube.id, 'Outra')
    await api.get(`/api/classes/${outraClasse.id}/materiais`, autor.autorizacao).expect(404)
    await enviar(autor, outraClasse.id, PDF, 'a.pdf').expect(404)
    const secaoDeFora = await prismaDeTeste().secaoRequisito.create({ data: { classeId: outraClasse.id, codigo: 'Z', nome: 'Z', ordem: 1 } })
    await enviar(autor, classe.id, PDF, 'a.pdf', { secaoId: secaoDeFora.id }).expect(404)
    await enviar(autor, classe.id, PDF, 'a.pdf', { secaoId: secao.id }).expect(201)

    const material = await criarMaterial({ clubeId: clube.id, classeId: classe.id, autorId: autor.usuario.id, titulo: 'M' })
    const admDeFora = await criarAcesso({ clubeId: (await criarClube()).id, papel: 'ADM' })
    await request(servidor()).delete(`/api/materiais/${material.id}`).set('Authorization', admDeFora.autorizacao).expect(404)
    await api.get(`/api/classes/${classe.id}/materiais`, admDeFora.autorizacao).expect(404)

    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    await api.get(`/api/classes/${classe.id}/materiais`, conselheiro.autorizacao).expect(403)
    await api.post('/api/materiais/link', conselheiro.autorizacao, { classeId: classe.id, secaoId: null, titulo: 'x', url: 'https://a.test' }).expect(403)
  })
})
