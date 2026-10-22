import { readFile, rm } from 'node:fs/promises'
import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  COTA_DA_BIBLIOTECA_BYTES,
  AcrescentarExemplares,
  ItemBibliotecaDados,
  LivroFisicoEntrada,
  Uuid,
  type BibliotecaSaida,
  type CategoriaBibliotecaEntrada,
  type CategoriaBibliotecaSaida,
  type ItemBibliotecaEditar,
  type ItemBibliotecaSaida,
  type ItemFisicoSaida,
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
type Banco = Pick<PrismaService, 'arquivo' | 'categoriaBiblioteca' | 'itemBiblioteca' | 'exemplarBiblioteca' | 'emprestimoBiblioteca'>

const CATEGORIA_NAO_ENCONTRADA = 'Categoria não encontrada.'
const ITEM_NAO_ENCONTRADO = 'Item não encontrado.'
const LIVRO_NAO_ENCONTRADO = 'Livro não encontrado.'
const QUANTIDADE_INVALIDA = 'Um livro pode ter de 1 a 50 exemplares.'
const EXEMPLAR_EMPRESTADO = 'Esse exemplar está emprestado. Registre a devolução antes.'
const EXEMPLAR_JA_BAIXADO = 'Esse exemplar já foi retirado.'
const LIVRO_EMPRESTADO = 'Devolva os exemplares antes de remover.'
const MAXIMO_DE_EXEMPLARES = 50
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
  tipo: true,
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
  tipo: 'DIGITAL' | 'FISICO'
  arquivoId: string | null
  capaId: string | null
  arquivo: { bytes: number; caminho: string } | null
  capa: { bytes: number; caminho: string; miniaturaCaminho: string | null } | null
}

interface Contagem {
  total: number
  disponiveis: number
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

/** A quantidade fora de 1 a 50 tem mensagem própria da spec, no lugar da lista de campos do pipe. */
function lerComQuantidade<T extends z.ZodType>(schema: T, corpo: unknown): z.output<T> {
  const resultado = schema.safeParse(corpo)
  if (resultado.success) return resultado.data
  if (resultado.error.issues.some((problema) => problema.path[0] === 'quantidade')) {
    throw new ErroApp('VALIDACAO', QUANTIDADE_INVALIDA, { quantidade: QUANTIDADE_INVALIDA })
  }
  return new ZodValidationPipe(schema).transform(corpo)
}

function idsDosFisicos(itens: Array<Pick<LinhaDoItem, 'id' | 'tipo'>>): string[] {
  return itens.filter((item) => item.tipo === 'FISICO').map((item) => item.id)
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
    const contagens = await this.contarExemplares(this.prisma, clubeId, idsDosFisicos(itens))
    const itensDaCategoria = new Map<string, ItemBibliotecaSaida[]>()
    for (const item of itens) {
      const daCategoria = itensDaCategoria.get(item.categoriaId) ?? []
      daCategoria.push(this.saidaDoItem(clubeId, item, contagens.get(item.id)))
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
      const contagens = await this.contarExemplares(tx, clubeId, idsDosFisicos(itens))
      return { ...renomeada, itens: itens.map((item) => this.saidaDoItem(clubeId, item, contagens.get(item.id))) }
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
      return this.saidaComContagem(tx, clubeId, await this.exigirItemAtivo(tx, clubeId, id))
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
      if (!atual.capaId) return { saida: await this.saidaComContagem(tx, clubeId, atual), antiga: null }
      await tx.itemBiblioteca.updateMany({ where: { clubeId, id, removidoEm: null }, data: { capaId: null } })
      await tx.arquivo.deleteMany({ where: { clubeId, id: atual.capaId } })
      return { saida: await this.saidaComContagem(tx, clubeId, { ...atual, capaId: null, capa: null }), antiga: atual.capa }
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

  /**
   * Marca como removido e só depois de gravado apaga PDF e capa; se o disco falhar, a limpeza da subida termina o serviço.
   * Livro físico com exemplar emprestado não sai da estante: o atraso ficaria preso sem ninguém para cobrar.
   */
  async removerItem(sessao: SessaoLogada, id: string): Promise<void> {
    const { clubeId } = sessao
    const removido = await this.escrever(clubeId, async (tx) => {
      const atual = await this.exigirItemAtivo(tx, clubeId, id)
      if (atual.tipo === 'FISICO') {
        const emAberto = await tx.emprestimoBiblioteca.count({
          where: { clubeId, devolvidoEm: null, exemplar: { is: { clubeId, itemId: id } } },
        })
        if (emAberto > 0) throw new ErroApp('CONFLITO', LIVRO_EMPRESTADO)
      }
      await tx.itemBiblioteca.updateMany({
        where: { clubeId, id, removidoEm: null },
        data: { removidoEm: new Date(), removidoPorId: sessao.usuarioId },
      })
      return atual
    })
    if (removido.arquivo) await this.apagarDoDisco(removido.arquivo.caminho)
    if (removido.capa) await this.apagarCapaDoDisco(removido.capa)
  }

  /** Livro físico não tem arquivo: a capa vem depois, pela mesma rota do digital. */
  async criarLivroFisico(sessao: SessaoLogada, corpo: unknown): Promise<ItemFisicoSaida> {
    const entrada = lerComQuantidade(LivroFisicoEntrada, corpo)
    const { clubeId } = sessao
    return this.escrever(clubeId, async (tx) => {
      await this.exigirCategoriaAtiva(tx, clubeId, entrada.categoriaId)
      const ordem = await this.proximaOrdemDoItem(tx, clubeId, entrada.categoriaId)
      const criado = await tx.itemBiblioteca.create({
        data: {
          clubeId,
          categoriaId: entrada.categoriaId,
          nome: entrada.nome,
          descricao: entrada.descricao,
          ordem,
          tipo: 'FISICO',
          enviadoPorId: sessao.usuarioId,
        },
        select: SELECAO_DO_ITEM,
      })
      await tx.exemplarBiblioteca.createMany({
        data: Array.from({ length: entrada.quantidade }, (_, indice) => ({ clubeId, itemId: criado.id, numero: indice + 1 })),
      })
      return this.fisicoDe(tx, clubeId, criado)
    })
  }

  /** O número novo é o maior já usado + 1, baixados incluídos, para nunca reaproveitar a etiqueta de um exemplar retirado. */
  async acrescentarExemplares(sessao: SessaoLogada, id: string, corpo: unknown): Promise<ItemFisicoSaida> {
    const { quantidade } = lerComQuantidade(AcrescentarExemplares, corpo)
    const { clubeId } = sessao
    return this.escrever(clubeId, async (tx) => {
      const livro = await this.exigirLivroFisico(tx, clubeId, id)
      const ativos = await tx.exemplarBiblioteca.count({ where: { clubeId, itemId: id, baixadoEm: null } })
      if (ativos + quantidade > MAXIMO_DE_EXEMPLARES) throw new ErroApp('VALIDACAO', QUANTIDADE_INVALIDA, { quantidade: QUANTIDADE_INVALIDA })
      const ultimo = await tx.exemplarBiblioteca.aggregate({ where: { clubeId, itemId: id }, _max: { numero: true } })
      const primeiro = (ultimo._max.numero ?? 0) + 1
      await tx.exemplarBiblioteca.createMany({
        data: Array.from({ length: quantidade }, (_, indice) => ({ clubeId, itemId: id, numero: primeiro + indice })),
      })
      return this.fisicoDe(tx, clubeId, livro)
    })
  }

  /** Baixa nunca apaga: preenche `baixadoEm` e a linha fica para o histórico. */
  async darBaixa(sessao: SessaoLogada, id: string, exemplarId: string): Promise<ItemFisicoSaida> {
    const { clubeId } = sessao
    return this.escrever(clubeId, async (tx) => {
      const livro = await this.exigirLivroFisico(tx, clubeId, id)
      const exemplar = await tx.exemplarBiblioteca.findFirst({
        where: { clubeId, id: exemplarId, itemId: id },
        select: { id: true, baixadoEm: true },
      })
      if (!exemplar) throw new ErroApp('NAO_ENCONTRADO', LIVRO_NAO_ENCONTRADO)
      if (exemplar.baixadoEm) throw new ErroApp('CONFLITO', EXEMPLAR_JA_BAIXADO)
      const emAberto = await tx.emprestimoBiblioteca.count({ where: { clubeId, exemplarId, devolvidoEm: null } })
      if (emAberto > 0) throw new ErroApp('CONFLITO', EXEMPLAR_EMPRESTADO)
      await tx.exemplarBiblioteca.updateMany({
        where: { clubeId, id: exemplarId, baixadoEm: null },
        data: { baixadoEm: new Date(), baixadoPorId: sessao.usuarioId },
      })
      return this.fisicoDe(tx, clubeId, livro)
    })
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
          return { saida: await this.saidaComContagem(tx, clubeId, await this.exigirItemAtivo(tx, clubeId, id)), antiga: atual.capa }
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
    if (item) return item
    const fisico = await banco.itemBiblioteca.findFirst({ where: { clubeId, id, tipo: 'FISICO' }, select: { id: true } })
    throw new ErroApp('NAO_ENCONTRADO', fisico ? LIVRO_NAO_ENCONTRADO : ITEM_NAO_ENCONTRADO)
  }

  /** Livro físico ativo do clube; digital, removido, de outro clube ou inexistente são o mesmo 404. */
  private async exigirLivroFisico(banco: Banco, clubeId: string, id: string): Promise<LinhaDoItem> {
    const livro = await banco.itemBiblioteca.findFirst({ where: { clubeId, id, tipo: 'FISICO', removidoEm: null }, select: SELECAO_DO_ITEM })
    if (!livro) throw new ErroApp('NAO_ENCONTRADO', LIVRO_NAO_ENCONTRADO)
    return livro
  }

  /** `total` são os exemplares não baixados; `disponiveis` os que não têm empréstimo aberto. Nunca traz nome de pessoa. */
  private async contarExemplares(banco: Banco, clubeId: string, itemIds: string[]): Promise<Map<string, Contagem>> {
    const contagens = new Map<string, Contagem>()
    if (itemIds.length === 0) return contagens
    const exemplares = await banco.exemplarBiblioteca.findMany({
      where: { clubeId, itemId: { in: itemIds }, baixadoEm: null },
      select: { itemId: true, emprestimos: { where: { clubeId, devolvidoEm: null }, select: { id: true } } },
    })
    for (const exemplar of exemplares) {
      const atual = contagens.get(exemplar.itemId) ?? { total: 0, disponiveis: 0 }
      atual.total += 1
      if (exemplar.emprestimos.length === 0) atual.disponiveis += 1
      contagens.set(exemplar.itemId, atual)
    }
    return contagens
  }

  private async saidaComContagem(banco: Banco, clubeId: string, linha: LinhaDoItem): Promise<ItemBibliotecaSaida> {
    const contagens = await this.contarExemplares(banco, clubeId, idsDosFisicos([linha]))
    return this.saidaDoItem(clubeId, linha, contagens.get(linha.id))
  }

  private async fisicoDe(banco: Banco, clubeId: string, linha: LinhaDoItem): Promise<ItemFisicoSaida> {
    const saida = await this.saidaComContagem(banco, clubeId, linha)
    if (saida.tipo !== 'FISICO') throw new Error(`O item ${linha.id} não é um livro físico.`)
    return saida
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

  private saidaDoItem(clubeId: string, linha: LinhaDoItem, contagem?: Contagem): ItemBibliotecaSaida {
    const base = {
      id: linha.id,
      categoriaId: linha.categoriaId,
      nome: linha.nome,
      descricao: linha.descricao,
      capaUrl: linha.capaId ? this.arquivos.urlAssinada(clubeId, linha.capaId, 'miniatura') : null,
    }
    if (linha.tipo === 'FISICO') {
      return { ...base, tipo: 'FISICO', total: contagem?.total ?? 0, disponiveis: contagem?.disponiveis ?? 0 }
    }
    if (!linha.arquivo || !linha.arquivoId) throw new Error(`O livro digital ${linha.id} está sem arquivo.`)
    return {
      ...base,
      tipo: 'DIGITAL',
      bytes: linha.arquivo.bytes,
      urlLer: this.arquivos.urlAssinada(clubeId, linha.arquivoId, 'original'),
      urlBaixar: this.arquivos.urlAssinada(clubeId, linha.arquivoId, 'baixar'),
    }
  }
}
