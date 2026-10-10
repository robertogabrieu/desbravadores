import { Injectable } from '@nestjs/common'
import {
  type ReuniaoDetalhe,
  type ReuniaoFiltro,
  type ReuniaoResumo,
} from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoArquivos } from '../arquivos/servico-arquivos'
import { colador, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import { dentroDoPrazoDeCorrecao, exigirUnidadeNoEscopo } from './apoio'

type Resumo = z.infer<typeof ReuniaoResumo>
type Detalhe = z.infer<typeof ReuniaoDetalhe>

const MINIATURAS_NO_DETALHE = 4

function emAberto(situacao: string): boolean {
  return situacao === 'PRESENTE' || situacao === 'ATRASADO'
}

/** Primeiro dia do mes ("AAAA-MM") e do mes seguinte, para o filtro `data >= inicio AND data < fim`. */
function limitesDoMes(mes: string): { inicio: Date; fim: Date } {
  const [ano, numero] = mes.split('-').map(Number)
  return { inicio: new Date(Date.UTC(ano ?? 0, (numero ?? 1) - 1, 1)), fim: new Date(Date.UTC(ano ?? 0, numero ?? 1, 1)) }
}

@Injectable()
export class ReunioesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly arquivos: ServicoArquivos,
  ) {}

  /** `GET /reunioes?unidadeId&mes`: uma linha por reuniao do mes, da mais recente a mais antiga. */
  async listar(sessao: SessaoLogada, filtro: z.infer<typeof ReuniaoFiltro>): Promise<Resumo[]> {
    const { clubeId } = sessao
    await exigirUnidadeNoEscopo(this.prisma, this.escopo, sessao, filtro.unidadeId)
    const { inicio, fim } = limitesDoMes(filtro.mes)
    const reunioes = await this.prisma.reuniao.findMany({
      where: { clubeId, unidadeId: filtro.unidadeId, data: { gte: inicio, lt: fim } },
      orderBy: { data: 'desc' },
      include: { chamadas: { where: { clubeId }, select: { situacao: true, uniforme: true, biblia: true } } },
    })
    const alteradas = await this.prisma.chamadaAlteracao.groupBy({
      by: ['reuniaoId'],
      where: { clubeId, reuniaoId: { in: reunioes.map((reuniao) => reuniao.id) } },
    })
    const comAlteracao = new Set(alteradas.map((alteracao) => alteracao.reuniaoId))

    return reunioes.map((reuniao) => {
      const presentes = reuniao.chamadas.filter((linha) => emAberto(linha.situacao)).length
      const total = reuniao.chamadas.length
      return {
        id: reuniao.id,
        data: paraDataCivil(reuniao.data),
        horario: reuniao.horario,
        presentes,
        total,
        atrasos: reuniao.chamadas.filter((linha) => linha.situacao === 'ATRASADO').length,
        uniformes: reuniao.chamadas.filter((linha) => linha.uniforme).length,
        biblias: reuniao.chamadas.filter((linha) => linha.biblia).length,
        percentual: total === 0 ? null : Math.round((presentes / total) * 100),
        alterada: comAlteracao.has(reuniao.id),
      }
    })
  }

  /** `GET /reunioes/:id`. Reuniao de fora do escopo e igual a inexistente: 404. */
  async detalhe(sessao: SessaoLogada, id: string, agora: Date = new Date()): Promise<Detalhe> {
    const { clubeId } = sessao
    const reuniao = await this.prisma.reuniao.findFirst({
      where: { clubeId, id },
      include: {
        unidade: { select: { id: true, nome: true } },
        registradaPor: { select: { nome: true } },
        chamadas: { where: { clubeId }, include: { dbv: { select: { nome: true, nomePublico: true } } } },
      },
    })
    if (!reuniao) throw new ErroApp('NAO_ENCONTRADO', 'Reunião não encontrada.')
    await exigirUnidadeNoEscopo(this.prisma, this.escopo, sessao, reuniao.unidadeId).catch(() => {
      throw new ErroApp('NAO_ENCONTRADO', 'Reunião não encontrada.')
    })

    const [configuracao, lancamentos, ultimaAlteracao, conflitos, album] = await Promise.all([
      this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } }),
      this.prisma.lancamentoPontos.findMany({
        where: { clubeId, origemTipo: 'CHAMADA', origemId: { startsWith: `${id}:` }, estornadoEm: null },
        select: { dbvId: true, pontos: true },
      }),
      this.prisma.chamadaAlteracao.findFirst({
        where: { clubeId, reuniaoId: id },
        orderBy: { alteradaEm: 'desc' },
        include: { alteradaPor: { select: { nome: true } } },
      }),
      this.prisma.chamadaAlteracao.count({ where: { clubeId, reuniaoId: id, origem: 'CONFLITO_SYNC' } }),
      this.albumDaReuniao(clubeId, id),
    ])
    const pontosPorDbv = new Map<string, number>()
    for (const lancamento of lancamentos) {
      pontosPorDbv.set(lancamento.dbvId, (pontosPorDbv.get(lancamento.dbvId) ?? 0) + lancamento.pontos)
    }
    const chamada = reuniao.chamadas
      .map((linha) => ({
        dbvId: linha.dbvId,
        situacao: linha.situacao,
        uniforme: linha.uniforme,
        biblia: linha.biblia,
        licao: linha.licao,
        versao: linha.versao.toISOString(),
        nome: linha.dbv.nome,
        nomePublico: linha.dbv.nomePublico,
        pontos: pontosPorDbv.get(linha.dbvId) ?? 0,
      }))
      .sort((a, b) => colador.compare(a.nome, b.nome) || a.dbvId.localeCompare(b.dbvId))

    return {
      id: reuniao.id,
      unidade: reuniao.unidade,
      data: paraDataCivil(reuniao.data),
      horario: reuniao.horario,
      local: reuniao.local,
      observacoes: reuniao.observacoes,
      cabecalhoVersao: reuniao.cabecalhoVersao.toISOString(),
      registradaPor: { nome: reuniao.registradaPor.nome },
      registradaEm: reuniao.registradaEm.toISOString(),
      substituicao: null,
      alterada: ultimaAlteracao
        ? { por: ultimaAlteracao.alteradaPor.nome, em: ultimaAlteracao.alteradaEm.toISOString(), conflito: conflitos > 0 }
        : null,
      podeEditar:
        sessao.papel === 'ADM' || dentroDoPrazoDeCorrecao(paraDataCivil(reuniao.data), agora, configuracao.fuso),
      chamada,
      totais: {
        presentes: chamada.filter((linha) => emAberto(linha.situacao)).length,
        total: chamada.length,
        atrasos: chamada.filter((linha) => linha.situacao === 'ATRASADO').length,
        uniformes: chamada.filter((linha) => linha.uniforme).length,
        biblias: chamada.filter((linha) => linha.biblia).length,
        pontos: chamada.reduce((soma, linha) => soma + linha.pontos, 0),
      },
      album,
    }
  }

  private async albumDaReuniao(clubeId: string, reuniaoId: string): Promise<Detalhe['album']> {
    const album = await this.prisma.album.findFirst({ where: { clubeId, reuniaoId }, select: { id: true } })
    if (!album) return null
    const ativas = { clubeId, albumId: album.id, removidaEm: null }
    const [totalFotos, amostra] = await Promise.all([
      this.prisma.foto.count({ where: ativas }),
      this.prisma.foto.findMany({
        where: { ...ativas, arquivo: { miniaturaCaminho: { not: null } } },
        orderBy: [{ enviadaEm: 'asc' }, { id: 'asc' }],
        take: MINIATURAS_NO_DETALHE,
        select: { arquivoId: true },
      }),
    ])
    return {
      id: album.id,
      totalFotos,
      miniaturas: amostra.map((foto) => this.arquivos.urlAssinada(clubeId, foto.arquivoId, 'miniatura')),
    }
  }
}

