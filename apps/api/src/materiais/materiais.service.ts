import { rm } from 'node:fs/promises'
import { extname } from 'node:path'
import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  FORMATOS_MATERIAL,
  MaterialArquivoDados,
  type MaterialEditarEntrada,
  type MaterialLinkEntrada,
  type MaterialSaida,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { ARMAZENAMENTO, type Armazenamento } from '../arquivos/armazenamento'
import { caminhoDoMaterial, ServicoArquivos } from '../arquivos/servico-arquivos'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { exigirClasseDoEscopo } from '../observacoes/escopo-da-classe'
import { conteudoConfereComExtensao, ehExtensaoDeMaterial } from './conferencia-de-documento'

type Saida = z.infer<typeof MaterialSaida>

export const COTA_DE_MATERIAIS_BYTES = 1024 * 1024 * 1024

/** A espera pela trava e a cópia de até 20 MB entram no prazo da transação (o padrão do Prisma é 5 s). */
const TEMPO_DA_TRANSACAO_MS = 60_000
const ESPERA_POR_CONEXAO_MS = 10_000

/** Arquivo que o multer guardou em disco temporário. */
export interface ArquivoEmDisco {
  path: string
  size: number
  originalname: string
}

const NAO_ENCONTRADO = 'Material não encontrado.'
const FORMATO_INVALIDO = 'Envie um arquivo PDF, PPTX, ODP, DOCX ou ODT válido.'

const SELECAO = {
  id: true,
  classeId: true,
  titulo: true,
  tipo: true,
  url: true,
  arquivoId: true,
  enviadoPorId: true,
  criadoEm: true,
  secao: { select: { id: true, codigo: true, nome: true, ordem: true } },
  arquivo: { select: { bytes: true } },
  enviadoPor: { select: { nome: true } },
} as const

type LinhaMaterial = {
  id: string
  classeId: string
  titulo: string
  tipo: Saida['tipo']
  url: string | null
  arquivoId: string | null
  enviadoPorId: string
  criadoEm: Date
  secao: { id: string; codigo: string; nome: string; ordem: number } | null
  arquivo: { bytes: number } | null
  enviadoPor: { nome: string }
}

function lerDados(corpo: unknown): z.infer<typeof MaterialArquivoDados> {
  const bruto = typeof corpo === 'object' && corpo !== null ? (corpo as Record<string, unknown>)['dados'] : undefined
  let json: unknown
  try {
    json = typeof bruto === 'string' ? JSON.parse(bruto) : undefined
  } catch {
    json = undefined
  }
  const resultado = MaterialArquivoDados.safeParse(json)
  if (!resultado.success) throw new ErroApp('VALIDACAO', 'Confira os campos informados.', { dados: 'Dados do material inválidos.' })
  return resultado.data
}

@Injectable()
export class MateriaisService {
  private readonly logger = new Logger(MateriaisService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly arquivos: ServicoArquivos,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
  ) {}

  /** Por seção na ordem do caderno, depois "sem seção"; dentro de cada uma, o mais novo primeiro. */
  async listar(sessao: SessaoLogada, classeId: string): Promise<Saida[]> {
    await exigirClasseDoEscopo(this.prisma, sessao, classeId)
    const linhas = await this.prisma.material.findMany({
      where: { clubeId: sessao.clubeId, classeId, removidoEm: null },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      select: SELECAO,
    })
    const ordemDaSecao = (linha: LinhaMaterial): number => (linha.secao ? linha.secao.ordem : Number.MAX_SAFE_INTEGER)
    return [...linhas].sort((a, b) => ordemDaSecao(a) - ordemDaSecao(b)).map((linha) => this.saida(sessao, linha))
  }

  async criarLink(sessao: SessaoLogada, entrada: z.infer<typeof MaterialLinkEntrada>): Promise<Saida> {
    await exigirClasseDoEscopo(this.prisma, sessao, entrada.classeId)
    await this.exigirSecaoDaClasse(entrada.classeId, entrada.secaoId)
    const criado = await this.prisma.material.create({
      data: {
        clubeId: sessao.clubeId,
        classeId: entrada.classeId,
        secaoId: entrada.secaoId,
        titulo: entrada.titulo,
        tipo: 'LINK',
        url: entrada.url,
        enviadoPorId: sessao.usuarioId,
      },
      select: SELECAO,
    })
    return this.saida(sessao, criado)
  }

  /** O temporário do multer some em qualquer desfecho: movido para o destino ou apagado no `finally`. */
  async criarArquivo(sessao: SessaoLogada, corpo: unknown, arquivo: ArquivoEmDisco | undefined): Promise<Saida> {
    if (!arquivo) throw new ErroApp('VALIDACAO', 'Confira os campos informados.', { arquivo: 'Envie o arquivo.' })
    try {
      return await this.gravarArquivo(sessao, corpo, arquivo)
    } finally {
      await rm(arquivo.path, { force: true })
    }
  }

  async editar(sessao: SessaoLogada, id: string, entrada: z.infer<typeof MaterialEditarEntrada>): Promise<Saida> {
    const atual = await this.doAutorOuAdm(sessao, id)
    if (entrada.secaoId) await this.exigirSecaoDaClasse(atual.classeId, entrada.secaoId)
    const { count } = await this.prisma.material.updateMany({
      where: { clubeId: sessao.clubeId, id, removidoEm: null },
      data: {
        ...(entrada.titulo !== undefined ? { titulo: entrada.titulo } : {}),
        ...(entrada.secaoId !== undefined ? { secaoId: entrada.secaoId } : {}),
      },
    })
    if (count === 0) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADO)
    const editado = await this.prisma.material.findFirst({ where: { clubeId: sessao.clubeId, id }, select: SELECAO })
    if (!editado) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADO)
    return this.saida(sessao, editado)
  }

  /** Marca como removido e só depois de gravado apaga o arquivo; se o disco falhar, a limpeza da subida termina o serviço. */
  async apagar(sessao: SessaoLogada, id: string): Promise<void> {
    const atual = await this.doAutorOuAdm(sessao, id)
    const { count } = await this.prisma.material.updateMany({
      where: { clubeId: sessao.clubeId, id, removidoEm: null },
      data: { removidoEm: new Date() },
    })
    if (count === 0) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADO)
    if (!atual.arquivoId) return
    const arquivo = await this.prisma.arquivo.findFirst({
      where: { clubeId: sessao.clubeId, id: atual.arquivoId },
      select: { caminho: true },
    })
    if (arquivo) await this.apagarDoDisco(arquivo.caminho)
  }

  private async gravarArquivo(sessao: SessaoLogada, corpo: unknown, arquivo: ArquivoEmDisco): Promise<Saida> {
    const dados = lerDados(corpo)
    await exigirClasseDoEscopo(this.prisma, sessao, dados.classeId)
    await this.exigirSecaoDaClasse(dados.classeId, dados.secaoId)

    const ext = extname(arquivo.originalname).slice(1).toLowerCase()
    if (!ehExtensaoDeMaterial(ext) || !(await conteudoConfereComExtensao(arquivo.path, ext))) {
      throw new ErroApp('REGRA', FORMATO_INVALIDO)
    }
    const { clubeId } = sessao
    const formato = FORMATOS_MATERIAL[ext]
    let caminho: string | null = null
    const gravacoes: Promise<void>[] = []
    try {
      const criado = await this.prisma.$transaction(async (tx) => {
        // Serializa os envios do clube: quem chega depois confere a cota já com o material do primeiro.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`materiais:${clubeId}`}, 0))`
        const usado = await tx.arquivo.aggregate({
          where: { clubeId, material: { is: { removidoEm: null } } },
          _sum: { bytes: true },
        })
        if ((usado._sum.bytes ?? 0) + arquivo.size > COTA_DE_MATERIAIS_BYTES) {
          throw new ErroApp('REGRA', 'O espaço de materiais do clube acabou.')
        }
        // O id vem do Prisma Client; o caminho, que leva o id, é gravado logo depois de criado.
        const linhaDoArquivo = await tx.arquivo.create({
          data: { clubeId, caminho: '', mime: formato.mime, bytes: arquivo.size, criadoPorId: sessao.usuarioId },
          select: { id: true },
        })
        const destino = caminhoDoMaterial(clubeId, linhaDoArquivo.id, ext)
        caminho = destino
        const gravacao = this.armazenamento.gravarDeArquivo(destino, arquivo.path)
        gravacoes.push(gravacao)
        await gravacao
        await tx.arquivo.updateMany({ where: { clubeId, id: linhaDoArquivo.id }, data: { caminho: destino } })
        return tx.material.create({
          data: {
            clubeId,
            classeId: dados.classeId,
            secaoId: dados.secaoId,
            titulo: dados.titulo,
            tipo: formato.tipo,
            arquivoId: linhaDoArquivo.id,
            enviadoPorId: sessao.usuarioId,
          },
          select: SELECAO,
        })
      }, { timeout: TEMPO_DA_TRANSACAO_MS, maxWait: ESPERA_POR_CONEXAO_MS })
      return this.saida(sessao, criado)
    } catch (erro) {
      // Se a transação estourou no meio da cópia, a cópia segue: só apaga depois que ela termina.
      await Promise.allSettled(gravacoes)
      if (caminho) await this.apagarDoDisco(caminho)
      throw erro
    }
  }

  private async exigirSecaoDaClasse(classeId: string, secaoId: string | null): Promise<void> {
    if (!secaoId) return
    const secao = await this.prisma.secaoRequisito.findFirst({ where: { id: secaoId, classeId }, select: { id: true } })
    if (!secao) throw new ErroApp('NAO_ENCONTRADO', 'Seção não encontrada.')
  }

  /** Material ativo, numa classe do escopo; renomear, mover e apagar são do autor ou do Adm. */
  private async doAutorOuAdm(sessao: SessaoLogada, id: string): Promise<LinhaMaterial> {
    if (sessao.papel === 'CONSELHEIRO') throw new ErroApp('SEM_PERMISSAO', 'Você não tem permissão para fazer isso.')
    const linha = await this.prisma.material.findFirst({
      where: { clubeId: sessao.clubeId, id, removidoEm: null },
      select: SELECAO,
    })
    if (!linha) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADO)
    await exigirClasseDoEscopo(this.prisma, sessao, linha.classeId)
    if (sessao.papel !== 'ADM' && linha.enviadoPorId !== sessao.usuarioId) {
      throw new ErroApp('SEM_PERMISSAO', 'Só quem enviou o material, ou o Adm, pode alterá-lo.')
    }
    return linha
  }

  private async apagarDoDisco(caminho: string): Promise<void> {
    try {
      await this.armazenamento.remover(caminho)
    } catch (erro) {
      this.logger.error(`Nao foi possivel apagar ${caminho}: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }

  private saida(sessao: SessaoLogada, linha: LinhaMaterial): Saida {
    const url = linha.arquivoId ? this.arquivos.urlAssinada(sessao.clubeId, linha.arquivoId, 'original') : (linha.url ?? '')
    return {
      id: linha.id,
      classeId: linha.classeId,
      secao: linha.secao ? { id: linha.secao.id, codigo: linha.secao.codigo, nome: linha.secao.nome } : null,
      titulo: linha.titulo,
      tipo: linha.tipo,
      url,
      bytes: linha.arquivo ? linha.arquivo.bytes : null,
      enviadoPor: linha.enviadoPor.nome,
      criadoEm: linha.criadoEm.toISOString(),
      podeEditar: sessao.papel === 'ADM' || linha.enviadoPorId === sessao.usuarioId,
    }
  }
}
