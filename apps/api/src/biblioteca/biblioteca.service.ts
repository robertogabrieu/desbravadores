import { readFile, rm } from 'node:fs/promises'
import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  COTA_DA_BIBLIOTECA_BYTES,
  ItemBibliotecaDados,
  Uuid,
  type BibliotecaSaida,
  type CategoriaBibliotecaEntrada,
  type CategoriaBibliotecaSaida,
  type ItemBibliotecaEditar,
  type ItemBibliotecaSaida,
  type MoverNaBiblioteca,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { ARMAZENAMENTO, type Armazenamento } from '../arquivos/armazenamento'
import { gravarEConfirmar } from '../arquivos/gravar-e-confirmar'
import { caminhoDaBiblioteca, ServicoArquivos } from '../arquivos/servico-arquivos'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { PrismaService } from '../comum/prisma/prisma.service'
import { gerarUuidV7 } from '../comum/uuid-v7'
import { conteudoConfereComExtensao } from '../materiais/conferencia-de-documento'
import { processarFoto, type FotoProcessada } from '../fotos/processamento-de-imagem'
import type { Prisma } from '../generated/prisma/client.js'
import { travarBiblioteca } from './constantes'

const TEMPO_DA_TRANSACAO_MS = 20_000

/** Arquivo que o multer guardou em disco temporário. */
export interface ArquivoEmDisco {
  path: string
  size: number
  originalname: string
}

/** Cliente com guarda ou transação: o que as conferências precisam, venham de onde vierem. */
type Banco = Pick<PrismaService, 'arquivo' | 'categoriaBiblioteca' | 'itemBiblioteca'>

const CATEGORIA_NAO_ENCONTRADA = 'Categoria não encontrada.'
const ITEM_NAO_ENCONTRADO = 'Item não encontrado.'
const NOME_REPETIDO = 'Já existe uma categoria com esse nome.'
const CATEGORIA_COM_ITENS = 'Tire os itens da categoria antes de excluí-la.'
const NAO_E_PDF = 'O arquivo não é um PDF.'
const CAPA_NAO_ACEITA = 'A capa precisa ser JPG, PNG ou WebP.'
const SEM_ESPACO = 'O espaço da biblioteca do clube acabou.'

const IdDaRota = new ZodValidationPipe(Uuid)
const DadosDoItem = new ZodValidationPipe(ItemBibliotecaDados)

const SELECAO_DO_ITEM = {
  id: true,
  categoriaId: true,
  nome: true,
  descricao: true,
  ordem: true,
  arquivoId: true,
  capaId: true,
  arquivo: { select: { bytes: true, caminho: true } },
  capa: { select: { bytes: true, caminho: true, miniaturaCaminho: true } },
} as const

interface CapaNoDisco {
  caminho: string
  miniaturaCaminho: string | null
}

interface LinhaDoItem {
  id: string
  categoriaId: string
  nome: string
  descricao: string | null
  ordem: number
  arquivoId: string
  capaId: string | null
  arquivo: { bytes: number; caminho: string }
  capa: { bytes: number; caminho: string; miniaturaCaminho: string | null } | null
}

interface Posicao {
  id: string
  ordem: number
}

/** O campo `dados` do multipart é um JSON em texto; o resto da validação é a do contrato. */
function lerDados(corpo: unknown): z.output<typeof ItemBibliotecaDados> {
  const bruto = typeof corpo === 'object' && corpo !== null ? (corpo as Record<string, unknown>)['dados'] : undefined
  let json: unknown
  try {
    json = typeof bruto === 'string' ? JSON.parse(bruto) : undefined
  } catch {
    json = undefined
  }
  return DadosDoItem.transform(json)
}

/** Quem vem antes (`acima`) ou depois (`abaixo`) de `atual` na ordem `(ordem, id)`, e a ordenação que põe o mais próximo primeiro. */
function aFrenteOuAtras(direcao: MoverNaBiblioteca['direcao'], atual: Posicao) {
  const lado =
    direcao === 'acima'
      ? { ordem: { lt: atual.ordem }, id: { lt: atual.id }, sentido: 'desc' as const }
      : { ordem: { gt: atual.ordem }, id: { gt: atual.id }, sentido: 'asc' as const }
  return {
    where: { OR: [{ ordem: lado.ordem }, { ordem: atual.ordem, id: lado.id }] },
    orderBy: [{ ordem: lado.sentido }, { id: lado.sentido }],
  }
}

@Injectable()
export class BibliotecaService {
  private readonly logger = new Logger(BibliotecaService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly arquivos: ServicoArquivos,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
  ) {}

  async listar(sessao: SessaoLogada): Promise<BibliotecaSaida> {
    const { clubeId } = sessao
    const [categorias, itens] = await Promise.all([
      this.prisma.categoriaBiblioteca.findMany({
        where: { clubeId, removidaEm: null },
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
        select: { id: true, nome: true },
      }),
      this.prisma.itemBiblioteca.findMany({
        where: { clubeId, removidoEm: null },
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
        select: SELECAO_DO_ITEM,
      }),
    ])
    const itensDaCategoria = new Map<string, ItemBibliotecaSaida[]>()
    for (const item of itens) {
      const daCategoria = itensDaCategoria.get(item.categoriaId) ?? []
      daCategoria.push(this.saidaDoItem(clubeId, item))
      itensDaCategoria.set(item.categoriaId, daCategoria)
    }
    return { categorias: categorias.map((categoria) => ({ ...categoria, itens: itensDaCategoria.get(categoria.id) ?? [] })) }
  }

  async criarCategoria(sessao: SessaoLogada, entrada: CategoriaBibliotecaEntrada): Promise<CategoriaBibliotecaSaida> {
    const { clubeId } = sessao
    return this.escrever(clubeId, async (tx) => {
      await this.exigirNomeLivre(tx, clubeId, entrada.nome)
      const ultima = await tx.categoriaBiblioteca.aggregate({ where: { clubeId, removidaEm: null }, _max: { ordem: true } })
      const criada = await tx.categoriaBiblioteca.create({
        data: { clubeId, nome: entrada.nome, ordem: (ultima._max.ordem ?? 0) + 1 },
        select: { id: true, nome: true },
      })
      return { ...criada, itens: [] }
    })
  }

  async renomearCategoria(sessao: SessaoLogada, id: string, entrada: CategoriaBibliotecaEntrada): Promise<CategoriaBibliotecaSaida> {
    const { clubeId } = sessao
    return this.escrever(clubeId, async (tx) => {
      await this.exigirCategoriaAtiva(tx, clubeId, id)
      await this.exigirNomeLivre(tx, clubeId, entrada.nome, id)
      const renomeada = await tx.categoriaBiblioteca.update({
        where: { clubeId_id: { clubeId, id } },
        data: { nome: entrada.nome },
        select: { id: true, nome: true },
      })
      const itens = await tx.itemBiblioteca.findMany({
        where: { clubeId, categoriaId: id, removidoEm: null },
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
        select: SELECAO_DO_ITEM,
      })
      return { ...renomeada, itens: itens.map((item) => this.saidaDoItem(clubeId, item)) }
    })
  }

  async moverCategoria(sessao: SessaoLogada, id: string, entrada: MoverNaBiblioteca): Promise<void> {
    const { clubeId } = sessao
    await this.escrever(clubeId, async (tx) => {
      const atual = await this.exigirCategoriaAtiva(tx, clubeId, id)
      const { where, orderBy } = aFrenteOuAtras(entrada.direcao, atual)
      const vizinha = await tx.categoriaBiblioteca.findFirst({
        where: { clubeId, removidaEm: null, ...where },
        orderBy,
        select: { id: true, ordem: true },
      })
      if (!vizinha) return
      await tx.categoriaBiblioteca.update({ where: { clubeId_id: { clubeId, id: atual.id } }, data: { ordem: vizinha.ordem } })
      await tx.categoriaBiblioteca.update({ where: { clubeId_id: { clubeId, id: vizinha.id } }, data: { ordem: atual.ordem } })
    })
  }

  async excluirCategoria(sessao: SessaoLogada, id: string): Promise<void> {
    const { clubeId } = sessao
    await this.escrever(clubeId, async (tx) => {
      await this.exigirCategoriaAtiva(tx, clubeId, id)
      const itensAtivos = await tx.itemBiblioteca.count({ where: { clubeId, categoriaId: id, removidoEm: null } })
      if (itensAtivos > 0) throw new ErroApp('REGRA', CATEGORIA_COM_ITENS)
      await tx.categoriaBiblioteca.update({
        where: { clubeId_id: { clubeId, id } },
        data: { removidaEm: new Date(), removidaPorId: sessao.usuarioId },
      })
    })
  }

  /** O temporário do multer some em qualquer desfecho: movido para o destino ou apagado no `finally`. */
  async criarItem(sessao: SessaoLogada, corpo: unknown, arquivo: ArquivoEmDisco | undefined): Promise<ItemBibliotecaSaida> {
    if (!arquivo) throw new ErroApp('VALIDACAO', 'Confira os campos informados.', { arquivo: 'Envie o arquivo.' })
    try {
      return await this.gravarItem(sessao, corpo, arquivo)
    } finally {
      await rm(arquivo.path, { force: true })
    }
  }

  async editarItem(sessao: SessaoLogada, id: string, entrada: ItemBibliotecaEditar): Promise<ItemBibliotecaSaida> {
    const { clubeId } = sessao
    return this.escrever(clubeId, async (tx) => {
      const atual = await this.exigirItemAtivo(tx, clubeId, id)
      const destino = entrada.categoriaId !== undefined && entrada.categoriaId !== atual.categoriaId ? entrada.categoriaId : null
      if (destino) await this.exigirCategoriaAtiva(tx, clubeId, destino)
      const mudancaDeCategoria = destino ? { categoriaId: destino, ordem: await this.proximaOrdemDoItem(tx, clubeId, destino) } : {}
      await tx.itemBiblioteca.updateMany({
        where: { clubeId, id, removidoEm: null },
        data: {
          ...(entrada.nome !== undefined ? { nome: entrada.nome } : {}),
          ...(entrada.descricao !== undefined ? { descricao: entrada.descricao } : {}),
          ...mudancaDeCategoria,
        },
      })
      return this.saidaDoItem(clubeId, await this.exigirItemAtivo(tx, clubeId, id))
    })
  }

  /**
   * O temporário some em qualquer desfecho. O id da rota é conferido aqui, e não por pipe, porque
   * o pipe rodaria depois do multer e deixaria o temporário para trás num id malformado.
   */
  async porCapa(sessao: SessaoLogada, id: string, capa: ArquivoEmDisco | undefined): Promise<ItemBibliotecaSaida> {
    try {
      const itemId = IdDaRota.transform(id)
      if (!capa) throw new ErroApp('VALIDACAO', 'Confira os campos informados.', { capa: 'Envie a imagem da capa.' })
      return await this.gravarCapa(sessao, itemId, capa)
    } finally {
      if (capa) await rm(capa.path, { force: true })
    }
  }

  async tirarCapa(sessao: SessaoLogada, id: string): Promise<ItemBibliotecaSaida> {
    const { clubeId } = sessao
    const { saida, antiga } = await this.escrever(clubeId, async (tx) => {
      const atual = await this.exigirItemAtivo(tx, clubeId, id)
      if (!atual.capaId) return { saida: this.saidaDoItem(clubeId, atual), antiga: null }
      await tx.itemBiblioteca.updateMany({ where: { clubeId, id, removidoEm: null }, data: { capaId: null } })
      await tx.arquivo.deleteMany({ where: { clubeId, id: atual.capaId } })
      return { saida: this.saidaDoItem(clubeId, { ...atual, capaId: null, capa: null }), antiga: atual.capa }
    })
    if (antiga) await this.apagarCapaDoDisco(antiga)
    return saida
  }

  async moverItem(sessao: SessaoLogada, id: string, entrada: MoverNaBiblioteca): Promise<void> {
    const { clubeId } = sessao
    await this.escrever(clubeId, async (tx) => {
      const atual = await this.exigirItemAtivo(tx, clubeId, id)
      const { where, orderBy } = aFrenteOuAtras(entrada.direcao, atual)
      const vizinho = await tx.itemBiblioteca.findFirst({
        where: { clubeId, categoriaId: atual.categoriaId, removidoEm: null, ...where },
        orderBy,
        select: { id: true, ordem: true },
      })
      if (!vizinho) return
      await tx.itemBiblioteca.updateMany({ where: { clubeId, id: atual.id }, data: { ordem: vizinho.ordem } })
      await tx.itemBiblioteca.updateMany({ where: { clubeId, id: vizinho.id }, data: { ordem: atual.ordem } })
    })
  }

  /** Marca como removido e só depois de gravado apaga PDF e capa; se o disco falhar, a limpeza da subida termina o serviço. */
  async removerItem(sessao: SessaoLogada, id: string): Promise<void> {
    const { clubeId } = sessao
    const removido = await this.escrever(clubeId, async (tx) => {
      const atual = await this.exigirItemAtivo(tx, clubeId, id)
      await tx.itemBiblioteca.updateMany({
        where: { clubeId, id, removidoEm: null },
        data: { removidoEm: new Date(), removidoPorId: sessao.usuarioId },
      })
      return atual
    })
    await this.apagarDoDisco(removido.arquivo.caminho)
    if (removido.capa) await this.apagarCapaDoDisco(removido.capa)
  }

  private async gravarItem(sessao: SessaoLogada, corpo: unknown, arquivo: ArquivoEmDisco): Promise<ItemBibliotecaSaida> {
    const dados = lerDados(corpo)
    const { clubeId } = sessao
    await this.exigirCategoriaAtiva(this.prisma, clubeId, dados.categoriaId)
    if (!(await conteudoConfereComExtensao(arquivo.path, 'pdf'))) throw new ErroApp('REGRA', NAO_E_PDF)

    // Conferência sem trava, só para falhar cedo; a definitiva é a da transação.
    await this.exigirEspaco(this.prisma, clubeId, arquivo.size)

    const arquivoId = gerarUuidV7()
    const destino = caminhoDaBiblioteca(clubeId, arquivoId, 'pdf')
    // A cópia de até 50 MB fica fora de qualquer transação: a trava do clube só cobre o que é rápido.
    return gravarEConfirmar(
      this.armazenamento,
      [{ caminho: destino, origem: arquivo.path }],
      () =>
        this.escrever(clubeId, async (tx) => {
          await this.exigirCategoriaAtiva(tx, clubeId, dados.categoriaId)
          await this.exigirEspaco(tx, clubeId, arquivo.size)
          const ordem = await this.proximaOrdemDoItem(tx, clubeId, dados.categoriaId)
          await tx.arquivo.create({
            data: { id: arquivoId, clubeId, caminho: destino, mime: 'application/pdf', bytes: arquivo.size, criadoPorId: sessao.usuarioId },
            select: { id: true },
          })
          const criado = await tx.itemBiblioteca.create({
            data: {
              clubeId,
              categoriaId: dados.categoriaId,
              nome: dados.nome,
              descricao: dados.descricao,
              ordem,
              arquivoId,
              enviadoPorId: sessao.usuarioId,
            },
            select: SELECAO_DO_ITEM,
          })
          return this.saidaDoItem(clubeId, criado)
        }),
      (caminho) => this.apagarDoDisco(caminho),
    )
  }

  private async gravarCapa(sessao: SessaoLogada, id: string, capa: ArquivoEmDisco): Promise<ItemBibliotecaSaida> {
    const { clubeId } = sessao
    await this.exigirItemAtivo(this.prisma, clubeId, id)
    const processada = await this.processarCapa(capa)

    const capaId = gerarUuidV7()
    const caminho = caminhoDaBiblioteca(clubeId, capaId, 'jpg')
    const miniaturaCaminho = caminhoDaBiblioteca(clubeId, capaId, 'jpg', true)
    const { saida, antiga } = await gravarEConfirmar(
      this.armazenamento,
      [
        { caminho, origem: processada.original },
        { caminho: miniaturaCaminho, origem: processada.miniatura },
      ],
      () =>
        this.escrever(clubeId, async (tx) => {
          const atual = await this.exigirItemAtivo(tx, clubeId, id)
          await this.exigirEspaco(tx, clubeId, processada.original.length, atual.capa?.bytes ?? 0)
          await tx.arquivo.create({
            data: {
              id: capaId,
              clubeId,
              caminho,
              miniaturaCaminho,
              mime: 'image/jpeg',
              bytes: processada.original.length,
              largura: processada.largura,
              altura: processada.altura,
              criadoPorId: sessao.usuarioId,
            },
            select: { id: true },
          })
          await tx.itemBiblioteca.updateMany({ where: { clubeId, id, removidoEm: null }, data: { capaId } })
          // A FK é `Restrict`: a linha antiga só sai depois de o item apontar para a nova.
          if (atual.capaId) await tx.arquivo.deleteMany({ where: { clubeId, id: atual.capaId } })
          return { saida: this.saidaDoItem(clubeId, await this.exigirItemAtivo(tx, clubeId, id)), antiga: atual.capa }
        }),
      (destino) => this.apagarDoDisco(destino),
    )
    if (antiga) await this.apagarCapaDoDisco(antiga)
    return saida
  }

  /** A capa passa pelo mesmo processamento das fotos (1600 px e miniatura de 400 px); o que ele recusa é formato de capa. */
  private async processarCapa(capa: ArquivoEmDisco): Promise<FotoProcessada> {
    const bytes = await readFile(capa.path)
    try {
      return await processarFoto(bytes)
    } catch {
      throw new ErroApp('REGRA', CAPA_NAO_ACEITA)
    }
  }

  /** Toda escrita da biblioteca roda sob a trava do clube: as conferências de dentro valem até o commit. */
  private escrever<T>(clubeId: string, trabalho: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await travarBiblioteca(tx, clubeId)
        return trabalho(tx)
      },
      { timeout: TEMPO_DA_TRANSACAO_MS },
    )
  }

  private async exigirCategoriaAtiva(banco: Banco, clubeId: string, id: string): Promise<Posicao> {
    const categoria = await banco.categoriaBiblioteca.findFirst({
      where: { clubeId, id, removidaEm: null },
      select: { id: true, ordem: true },
    })
    if (!categoria) throw new ErroApp('NAO_ENCONTRADO', CATEGORIA_NAO_ENCONTRADA)
    return categoria
  }

  private async exigirItemAtivo(banco: Banco, clubeId: string, id: string): Promise<LinhaDoItem> {
    const item = await banco.itemBiblioteca.findFirst({ where: { clubeId, id, removidoEm: null }, select: SELECAO_DO_ITEM })
    if (!item) throw new ErroApp('NAO_ENCONTRADO', ITEM_NAO_ENCONTRADO)
    return item
  }

  /** Nome único entre as categorias ativas do clube, sem diferença de maiúsculas; `exceto` é a que está sendo renomeada. */
  private async exigirNomeLivre(banco: Banco, clubeId: string, nome: string, exceto?: string): Promise<void> {
    const igual = await banco.categoriaBiblioteca.findFirst({
      where: {
        clubeId,
        removidaEm: null,
        nome: { equals: nome, mode: 'insensitive' },
        ...(exceto ? { NOT: { id: exceto } } : {}),
      },
      select: { id: true },
    })
    if (igual) throw new ErroApp('REGRA', NOME_REPETIDO)
  }

  private async proximaOrdemDoItem(banco: Banco, clubeId: string, categoriaId: string): Promise<number> {
    const ultimo = await banco.itemBiblioteca.aggregate({ where: { clubeId, categoriaId, removidoEm: null }, _max: { ordem: true } })
    return (ultimo._max.ordem ?? 0) + 1
  }

  /** Soma os PDFs e as capas dos itens ativos; `liberados` são os bytes da capa que a troca vai devolver. */
  private async exigirEspaco(banco: Banco, clubeId: string, bytes: number, liberados = 0): Promise<void> {
    const usado = await banco.arquivo.aggregate({
      where: {
        clubeId,
        OR: [{ itemBiblioteca: { is: { removidoEm: null } } }, { capaDeItem: { is: { removidoEm: null } } }],
      },
      _sum: { bytes: true },
    })
    if ((usado._sum.bytes ?? 0) - liberados + bytes > COTA_DA_BIBLIOTECA_BYTES) throw new ErroApp('REGRA', SEM_ESPACO)
  }

  private async apagarCapaDoDisco(capa: CapaNoDisco): Promise<void> {
    await this.apagarDoDisco(capa.caminho)
    if (capa.miniaturaCaminho) await this.apagarDoDisco(capa.miniaturaCaminho)
  }

  private async apagarDoDisco(caminho: string): Promise<void> {
    try {
      await this.armazenamento.remover(caminho)
    } catch (erro) {
      this.logger.error(`Nao foi possivel apagar ${caminho}: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }

  private saidaDoItem(clubeId: string, linha: LinhaDoItem): ItemBibliotecaSaida {
    return {
      id: linha.id,
      categoriaId: linha.categoriaId,
      nome: linha.nome,
      descricao: linha.descricao,
      bytes: linha.arquivo.bytes,
      urlLer: this.arquivos.urlAssinada(clubeId, linha.arquivoId, 'original'),
      urlBaixar: this.arquivos.urlAssinada(clubeId, linha.arquivoId, 'baixar'),
      capaUrl: linha.capaId ? this.arquivos.urlAssinada(clubeId, linha.capaId, 'miniatura') : null,
    }
  }
}
