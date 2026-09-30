import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  FotoEnvioDados,
  type AlbumDetalhe,
  type AlbumResumo,
  type FotoEnvioSaida,
  type SemAutorizacaoSaida,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { ARMAZENAMENTO, type Armazenamento } from '../arquivos/armazenamento'
import { caminhoDaFoto, ServicoArquivos } from '../arquivos/servico-arquivos'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { colador, daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import { Prisma } from '../generated/prisma/client.js'
import { processarFoto } from './processamento-de-imagem'

/** O que o servico usa do arquivo que o multer guardou em memoria. */
export interface ArquivoEnviado {
  buffer: Buffer
}

type DadosDoEnvio = z.infer<typeof FotoEnvioDados>

/** Album a criar junto com a foto; sem `id` o banco gera. */
interface AlbumNovo {
  id?: string
  unidadeId: string
  titulo: string
  data: string
  reuniaoId: string | null
}

interface AlbumEscolhido {
  albumId: string
  criar: AlbumNovo | null
}

const SEM_PERMISSAO = 'Você não tem permissão para fazer isso.'

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function lerDados(corpo: unknown): DadosDoEnvio {
  const bruto = ehObjeto(corpo) ? corpo['dados'] : undefined
  let json: unknown
  try {
    json = typeof bruto === 'string' ? JSON.parse(bruto) : undefined
  } catch {
    json = undefined
  }
  const resultado = FotoEnvioDados.safeParse(json)
  if (!resultado.success) throw new ErroApp('VALIDACAO', 'Confira os campos informados.', { dados: 'Dados da foto inválidos.' })
  return resultado.data
}

function tituloDaReuniao(data: string): string {
  const [, mes, dia] = data.split('-')
  return `Reunião · ${dia}/${mes}`
}

function ehCorrida(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002'
}

@Injectable()
export class FotosService {
  private readonly logger = new Logger(FotosService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly arquivos: ServicoArquivos,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
  ) {}

  async enviar(sessao: SessaoLogada, fotoId: string, corpo: unknown, arquivo: ArquivoEnviado | undefined): Promise<z.infer<typeof FotoEnvioSaida>> {
    const { clubeId } = sessao
    const unidadesDoEscopo = await this.unidadesDoEscopo(sessao)
    const dados = lerDados(corpo)
    if (!arquivo) throw new ErroApp('VALIDACAO', 'Confira os campos informados.', { arquivo: 'Envie a foto.' })

    const existente = await this.prisma.foto.findFirst({
      where: { clubeId, id: fotoId },
      select: { albumId: true, album: { select: { unidadeId: true } } },
    })
    if (existente) {
      this.exigirNoEscopo(unidadesDoEscopo, existente.album.unidadeId)
      return { fotoId, albumId: existente.albumId }
    }

    const { albumId, criar } = await this.escolherAlbum(sessao, unidadesDoEscopo, dados.album)
    const foto = await processarFoto(arquivo.buffer)

    const relogio = await this.escopo.relogio(clubeId)
    const ano = Number(relogio.hoje.slice(0, 4))
    const arquivoId = randomUUID()
    const caminho = caminhoDaFoto(clubeId, arquivoId, ano, 'original')
    const miniaturaCaminho = caminhoDaFoto(clubeId, arquivoId, ano, 'miniatura')

    const gravados: string[] = []
    try {
      for (const [destino, bytes] of [[caminho, foto.original], [miniaturaCaminho, foto.miniatura]] as const) {
        await this.armazenamento.gravar(destino, bytes)
        gravados.push(destino)
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.arquivo.create({
          data: {
            id: arquivoId,
            clubeId,
            caminho,
            miniaturaCaminho,
            mime: 'image/jpeg',
            bytes: foto.original.length,
            largura: foto.largura,
            altura: foto.altura,
            criadoPorId: sessao.usuarioId,
          },
        })
        if (criar) {
          await tx.album.create({
            data: {
              ...(criar.id ? { id: criar.id } : {}),
              clubeId,
              unidadeId: criar.unidadeId,
              titulo: criar.titulo,
              data: daDataCivil(criar.data),
              reuniaoId: criar.reuniaoId,
              criadoPorId: sessao.usuarioId,
            },
          })
        }
        await tx.foto.create({
          data: { id: fotoId, clubeId, albumId, arquivoId, legenda: dados.legenda, enviadaPorId: sessao.usuarioId },
        })
      })
    } catch (erro) {
      await this.apagarArquivos(gravados)
      if (ehCorrida(erro)) throw new ErroApp('TEMPORARIO', 'Tente de novo em instantes.')
      throw erro
    }
    return { fotoId, albumId }
  }

  async listarAlbuns(sessao: SessaoLogada, unidadeId: string): Promise<z.infer<typeof AlbumResumo>[]> {
    const { clubeId } = sessao
    await this.exigirUnidade(sessao, unidadeId)
    const albuns = await this.prisma.album.findMany({
      where: { clubeId, unidadeId, fotos: { some: { clubeId, removidaEm: null } } },
      orderBy: [{ data: 'desc' }, { criadoEm: 'desc' }],
      include: {
        fotos: {
          where: { clubeId, removidaEm: null },
          orderBy: { enviadaEm: 'asc' },
          select: { arquivoId: true, enviadaPor: { select: { nome: true } } },
        },
      },
    })
    return albuns.map((album) => ({
      id: album.id,
      titulo: album.titulo,
      data: paraDataCivil(album.data),
      reuniaoId: album.reuniaoId,
      totalFotos: album.fotos.length,
      capaUrl: album.fotos[0] ? this.arquivos.urlAssinada(clubeId, album.fotos[0].arquivoId, 'miniatura') : null,
      enviadoPor: [...new Set(album.fotos.map((foto) => foto.enviadaPor.nome))],
    }))
  }

  async detalharAlbum(sessao: SessaoLogada, id: string): Promise<z.infer<typeof AlbumDetalhe>> {
    const { clubeId } = sessao
    const unidadesDoEscopo = await this.unidadesDoEscopo(sessao)
    const album = await this.prisma.album.findFirst({
      where: { clubeId, id },
      include: {
        unidade: { select: { id: true, nome: true } },
        fotos: {
          where: { clubeId, removidaEm: null },
          orderBy: { enviadaEm: 'asc' },
          include: { enviadaPor: { select: { nome: true } } },
        },
      },
    })
    if (!album) throw new ErroApp('NAO_ENCONTRADO', 'Álbum não encontrado.')
    this.exigirNoEscopo(unidadesDoEscopo, album.unidadeId)
    return {
      id: album.id,
      titulo: album.titulo,
      data: paraDataCivil(album.data),
      unidade: album.unidade,
      reuniaoId: album.reuniaoId,
      fotos: album.fotos.map((foto) => ({
        id: foto.id,
        legenda: foto.legenda,
        enviadaPor: foto.enviadaPor.nome,
        enviadaEm: foto.enviadaEm.toISOString(),
        url: this.arquivos.urlAssinada(clubeId, foto.arquivoId, 'original'),
        miniaturaUrl: this.arquivos.urlAssinada(clubeId, foto.arquivoId, 'miniatura'),
        podeRemover: sessao.papel === 'ADM' || foto.enviadaPorId === sessao.usuarioId,
      })),
    }
  }

  async remover(sessao: SessaoLogada, id: string): Promise<void> {
    const { clubeId } = sessao
    const unidadesDoEscopo = await this.unidadesDoEscopo(sessao)
    const foto = await this.prisma.foto.findFirst({
      where: { clubeId, id },
      select: {
        enviadaPorId: true,
        removidaEm: true,
        album: { select: { unidadeId: true } },
        arquivo: { select: { caminho: true, miniaturaCaminho: true } },
      },
    })
    if (!foto) throw new ErroApp('NAO_ENCONTRADO', 'Foto não encontrada.')
    this.exigirNoEscopo(unidadesDoEscopo, foto.album.unidadeId)
    if (foto.removidaEm) throw new ErroApp('NAO_ENCONTRADO', 'Foto não encontrada.')
    if (sessao.papel !== 'ADM' && foto.enviadaPorId !== sessao.usuarioId) {
      throw new ErroApp('SEM_PERMISSAO', 'Só quem enviou a foto pode removê-la.')
    }

    const { count } = await this.prisma.foto.updateMany({
      where: { clubeId, id, removidaEm: null },
      data: { removidaEm: new Date(), removidaPorId: sessao.usuarioId },
    })
    if (count === 0) throw new ErroApp('NAO_ENCONTRADO', 'Foto não encontrada.')

    const caminhos = [foto.arquivo.caminho, foto.arquivo.miniaturaCaminho].filter((caminho): caminho is string => Boolean(caminho))
    await this.apagarArquivos(caminhos)
  }

  async semAutorizacaoDeImagem(sessao: SessaoLogada, unidadeId: string): Promise<z.infer<typeof SemAutorizacaoSaida>> {
    const { clubeId } = sessao
    await this.exigirUnidade(sessao, unidadeId)
    const desbravadores = await this.prisma.desbravador.findMany({
      where: {
        clubeId,
        tipo: 'DBV',
        ativo: true,
        autorizacaoImagem: false,
        membros: { some: { clubeId, unidadeId, fim: null } },
      },
      select: { nomePublico: true },
    })
    return { nomes: desbravadores.map((dbv) => dbv.nomePublico).sort((a, b) => colador.compare(a, b)) }
  }

  /** Unidades que o papel alcanca: `null` = todas do clube (Adm). Instrutor nunca chega a galeria. */
  private async unidadesDoEscopo(sessao: SessaoLogada): Promise<string[] | null> {
    if (sessao.papel === 'ADM') return null
    if (sessao.papel === 'CONSELHEIRO') return this.escopo.unidadesDoConselheiro(sessao)
    throw new ErroApp('SEM_PERMISSAO', SEM_PERMISSAO)
  }

  private exigirNoEscopo(unidadesDoEscopo: string[] | null, unidadeId: string): void {
    if (unidadesDoEscopo && !unidadesDoEscopo.includes(unidadeId)) throw new ErroApp('NAO_ENCONTRADO', 'Não encontrado.')
  }

  private async exigirUnidade(sessao: SessaoLogada, unidadeId: string, unidadesDoEscopo?: string[] | null): Promise<void> {
    this.exigirNoEscopo(unidadesDoEscopo === undefined ? await this.unidadesDoEscopo(sessao) : unidadesDoEscopo, unidadeId)
    const unidade = await this.prisma.unidade.findFirst({ where: { clubeId: sessao.clubeId, id: unidadeId }, select: { id: true } })
    if (!unidade) throw new ErroApp('NAO_ENCONTRADO', 'Unidade não encontrada.')
  }

  private async escolherAlbum(
    sessao: SessaoLogada,
    unidadesDoEscopo: string[] | null,
    album: DadosDoEnvio['album'],
  ): Promise<AlbumEscolhido> {
    const { clubeId } = sessao
    if (album.tipo === 'EXISTENTE') {
      const existente = await this.prisma.album.findFirst({ where: { clubeId, id: album.id }, select: { unidadeId: true } })
      if (!existente) throw new ErroApp('NAO_ENCONTRADO', 'Álbum não encontrado.')
      this.exigirNoEscopo(unidadesDoEscopo, existente.unidadeId)
      return { albumId: album.id, criar: null }
    }

    await this.exigirUnidade(sessao, album.unidadeId, unidadesDoEscopo)
    if (album.tipo === 'NOVO') {
      const existente = await this.prisma.album.findFirst({ where: { clubeId, id: album.id }, select: { unidadeId: true } })
      if (existente) {
        if (existente.unidadeId !== album.unidadeId) throw new ErroApp('NAO_ENCONTRADO', 'Álbum não encontrado.')
        return { albumId: album.id, criar: null }
      }
      return { albumId: album.id, criar: { id: album.id, unidadeId: album.unidadeId, titulo: album.titulo, data: album.data, reuniaoId: null } }
    }

    const reuniao = await this.prisma.reuniao.findFirst({
      where: { clubeId, unidadeId: album.unidadeId, data: daDataCivil(album.data) },
      select: { id: true },
    })
    if (!reuniao) throw new ErroApp('REGRA', 'A chamada desta reunião ainda não chegou.')
    const doAlbum = await this.prisma.album.findFirst({ where: { clubeId, reuniaoId: reuniao.id }, select: { id: true } })
    if (doAlbum) return { albumId: doAlbum.id, criar: null }
    const id = randomUUID()
    return {
      albumId: id,
      criar: { id, unidadeId: album.unidadeId, titulo: tituloDaReuniao(album.data), data: album.data, reuniaoId: reuniao.id },
    }
  }

  /** Falha ao apagar nao desfaz nada: vai ao log e a limpeza da subida da API repete. */
  private async apagarArquivos(caminhos: string[]): Promise<void> {
    for (const caminho of caminhos) {
      try {
        await this.armazenamento.remover(caminho)
      } catch (erro) {
        this.logger.error(`Nao foi possivel apagar ${caminho}: ${erro instanceof Error ? erro.message : String(erro)}`)
      }
    }
  }
}
