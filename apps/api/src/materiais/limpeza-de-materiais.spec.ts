import { randomUUID } from 'node:crypto'
import type { Readable } from 'node:stream'
import { criarClube, criarUsuario, desconectarPrismaDeTeste, prismaDeTeste } from '../../test/fabricas'
import type { Armazenamento } from '../arquivos/armazenamento'
import { caminhoDaBiblioteca } from '../arquivos/servico-arquivos'
import { PrismaService } from '../comum/prisma/prisma.service'
import { LimpezaDeMateriais } from './limpeza-de-materiais'

/** Dublê do disco: só anota o que a limpeza pediu para remover. */
class ArmazenamentoAnotador implements Armazenamento {
  readonly removidos: string[] = []
  falharEm: string | undefined

  gravar(): Promise<void> {
    return Promise.resolve()
  }

  gravarDeArquivo(): Promise<void> {
    return Promise.resolve()
  }

  abrir(): Readable {
    throw new Error('a limpeza nao le arquivo')
  }

  remover(caminho: string): Promise<void> {
    if (caminho === this.falharEm) return Promise.reject(new Error('disco falhou'))
    this.removidos.push(caminho)
    return Promise.resolve()
  }
}

describe('limpeza na subida: biblioteca', () => {
  const prisma = new PrismaService()
  let armazenamento: ArmazenamentoAnotador
  let limpeza: LimpezaDeMateriais

  beforeEach(() => {
    armazenamento = new ArmazenamentoAnotador()
    limpeza = new LimpezaDeMateriais(prisma, armazenamento)
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await desconectarPrismaDeTeste()
  })

  /** Um item da biblioteca no banco, com os caminhos que ele ocupa no disco (nada e gravado de verdade). */
  async function item(dados: { clubeId: string; categoriaId: string; enviadoPorId: string; removido: boolean; comCapa: boolean }) {
    const arquivoId = randomUUID()
    const capaId = randomUUID()
    const caminhos = {
      pdf: caminhoDaBiblioteca(dados.clubeId, arquivoId, 'pdf'),
      capa: caminhoDaBiblioteca(dados.clubeId, capaId, 'jpg'),
      miniatura: caminhoDaBiblioteca(dados.clubeId, capaId, 'jpg', true),
    }
    const base = { clubeId: dados.clubeId, criadoPorId: dados.enviadoPorId, bytes: 10 }
    await prismaDeTeste().arquivo.create({ data: { ...base, id: arquivoId, caminho: caminhos.pdf, mime: 'application/pdf' } })
    if (dados.comCapa) {
      await prismaDeTeste().arquivo.create({
        data: { ...base, id: capaId, caminho: caminhos.capa, miniaturaCaminho: caminhos.miniatura, mime: 'image/jpeg' },
      })
    }
    await prismaDeTeste().itemBiblioteca.create({
      data: {
        clubeId: dados.clubeId, categoriaId: dados.categoriaId, nome: `Item ${arquivoId.slice(0, 8)}`, ordem: 1,
        arquivoId, capaId: dados.comCapa ? capaId : null, enviadoPorId: dados.enviadoPorId,
        removidoEm: dados.removido ? new Date() : null, removidoPorId: dados.removido ? dados.enviadoPorId : null,
      },
    })
    return caminhos
  }

  async function cenario() {
    const clube = await criarClube()
    const enviadoPorId = (await criarUsuario()).id
    const categoria = await prismaDeTeste().categoriaBiblioteca.create({ data: { clubeId: clube.id, nome: 'Livros de teste', ordem: 10 } })
    return { clubeId: clube.id, categoriaId: categoria.id, enviadoPorId }
  }

  it('item removido com capa: o PDF, a capa e a miniatura da capa saem do armazenamento', async () => {
    const base = await cenario()
    const removido = await item({ ...base, removido: true, comCapa: true })
    await limpeza.limpar()
    expect(armazenamento.removidos).toEqual(expect.arrayContaining([removido.pdf, removido.capa, removido.miniatura]))
  })

  it('item removido sem capa: so o PDF', async () => {
    const base = await cenario()
    const removido = await item({ ...base, removido: true, comCapa: false })
    await limpeza.limpar()
    expect(armazenamento.removidos).toContain(removido.pdf)
    expect(armazenamento.removidos.filter((c) => c.startsWith(`clube/${base.clubeId}/`))).toEqual([removido.pdf])
  })

  it('item ativo fica intacto, ao lado de um removido do mesmo clube', async () => {
    const base = await cenario()
    const ativo = await item({ ...base, removido: false, comCapa: true })
    const removido = await item({ ...base, removido: true, comCapa: true })
    await limpeza.limpar()
    expect(armazenamento.removidos).toContain(removido.pdf)
    expect(armazenamento.removidos).not.toContain(ativo.pdf)
    expect(armazenamento.removidos).not.toContain(ativo.capa)
    expect(armazenamento.removidos).not.toContain(ativo.miniatura)
  })

  it('um caminho que falha ao apagar nao impede os outros', async () => {
    const base = await cenario()
    const removido = await item({ ...base, removido: true, comCapa: true })
    armazenamento.falharEm = removido.pdf
    await limpeza.limpar()
    expect(armazenamento.removidos).not.toContain(removido.pdf)
    expect(armazenamento.removidos).toEqual(expect.arrayContaining([removido.capa, removido.miniatura]))
  })

  it('mais de um lote (100) de itens removidos: todos saem', async () => {
    const base = await cenario()
    const caminhos: { pdf: string }[] = []
    for (let i = 0; i < 101; i++) caminhos.push(await item({ ...base, removido: true, comCapa: false }))
    await limpeza.limpar()
    expect(armazenamento.removidos).toEqual(expect.arrayContaining(caminhos.map((c) => c.pdf)))
  }, 60_000)
})
