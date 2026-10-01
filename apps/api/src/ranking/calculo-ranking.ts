import { Injectable } from '@nestjs/common'
import { frequencia, type SituacaoChamada } from '@desbravadores/shared'
import type { RefClasse, RefUnidade } from '@desbravadores/shared'
import type { z } from 'zod'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import { colador, daDataCivil } from '../desbravadores/apoio'
import { PrismaService } from '../comum/prisma/prisma.service'

export interface EntradaDoRanking {
  dbvId: string
  nome: string
  nomePublico: string
  unidade: z.infer<typeof RefUnidade> | null
  classe: z.infer<typeof RefClasse> | null
  pontos: number
  frequencia: number | null
}

export interface MediaDaUnidade {
  unidade: z.infer<typeof RefUnidade>
  mediaPontos: number
  totalDbvs: number
}

/** Mes civil "AAAA-MM" como intervalo de colunas `@db.Date`: `inicio` inclusive, `fim` exclusivo. */
export function limitesDoMes(mes: string): { inicio: Date; fim: Date } {
  const [ano, numero] = mes.split('-').map(Number)
  return { inicio: daDataCivil(`${mes}-01`), fim: new Date(Date.UTC(ano ?? 0, numero ?? 0, 1)) }
}

function frequenciaInteira(situacoes: SituacaoChamada[]): number | null {
  const bruta = frequencia(situacoes)
  return bruta === null ? null : Math.round(bruta)
}

function agrupar<T>(itens: T[], chave: (item: T) => string): Map<string, T[]> {
  const grupos = new Map<string, T[]>()
  for (const item of itens) {
    const grupo = grupos.get(chave(item)) ?? []
    grupo.push(item)
    grupos.set(chave(item), grupo)
  }
  return grupos
}

/** Ordem do ranking (E14): pontos, frequencia (nula por ultimo), nome. */
function comparar(a: EntradaDoRanking, b: EntradaDoRanking): number {
  if (a.pontos !== b.pontos) return b.pontos - a.pontos
  if (a.frequencia !== b.frequencia) {
    if (a.frequencia === null) return 1
    if (b.frequencia === null) return -1
    return b.frequencia - a.frequencia
  }
  return colador.compare(a.nome, b.nome)
}

interface FichaDoRanking {
  diretoriaDesde: Date | null
  membros: { inicio: Date; fim: Date | null; unidade: z.infer<typeof RefUnidade> }[]
}

/** DBV: a unidade aberta. Diretoria: a que ela deixou ao entrar (passagem encerrada no dia da entrada). */
function unidadeDoRanking(ficha: FichaDoRanking): z.infer<typeof RefUnidade> | undefined {
  const entrada = ficha.diretoriaDesde?.getTime()
  const passagem = ficha.membros.find((membro) => (entrada === undefined ? membro.fim === null : membro.fim?.getTime() === entrada))
  return passagem?.unidade
}

/**
 * Diretoria só conta num mês anterior à entrada se era desbravador nele: a passagem que a entrada encerrou já
 * tinha começado. Quem chega de Líder, ou volta à Diretoria sem unidade, não tem essa passagem.
 */
function eraDesbravadorNoMes(ficha: FichaDoRanking, fimDoMes: Date): boolean {
  const entrada = ficha.diretoriaDesde?.getTime()
  if (entrada === undefined) return true
  return ficha.membros.some((membro) => membro.fim?.getTime() === entrada && membro.inicio < fimDoMes)
}

/** Pontos e frequencia do mes (E13, E14). Nao decide quem pode ver nome ou frequencia: isso e do escopo. */
@Injectable()
export class CalculoRanking {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Quem era desbravador no mes, ja na ordem do ranking: DBV ativo, ou Diretoria que so entrou depois do fim
   * do mes e estava, nele, na unidade que deixou ao entrar. `unidadeId` filtra por essa unidade.
   */
  async doMes(clubeId: string, mes: string, anoClube: number, unidadeId?: string): Promise<EntradaDoRanking[]> {
    const { fim: fimDoMes } = limitesDoMes(mes)
    const fichas = await this.prisma.desbravador.findMany({
      where: {
        clubeId,
        ativo: true,
        OR: [{ tipo: 'DBV' }, { tipo: 'DIRETORIA', diretoriaDesde: { gte: fimDoMes } }],
      },
      select: {
        id: true,
        nome: true,
        nomePublico: true,
        diretoriaDesde: true,
        membros: {
          where: { OR: [{ fim: null }, { fim: { gte: fimDoMes } }] },
          select: { inicio: true, fim: true, unidade: { select: { id: true, nome: true } } },
        },
        matriculas: {
          where: { anoClube, status: 'CURSANDO', classe: { tipo: 'REGULAR' } },
          select: { classe: { select: SELECAO_REF_CLASSE } },
        },
      },
    })
    const comUnidade = fichas
      .filter((ficha) => eraDesbravadorNoMes(ficha, fimDoMes))
      .map((ficha) => ({ ...ficha, unidade: unidadeDoRanking(ficha) }))
    const dbvs = unidadeId ? comUnidade.filter((dbv) => dbv.unidade?.id === unidadeId) : comUnidade
    const dbvIds = dbvs.map((dbv) => dbv.id)
    const pontos = await this.pontosPorDbv(clubeId, dbvIds, mes)
    const chamadas = await this.situacoesPorDbv(clubeId, dbvIds, mes)

    return dbvs
      .map((dbv): EntradaDoRanking => {
        const { unidade } = dbv
        const classe = dbv.matriculas[0]?.classe
        return {
          dbvId: dbv.id,
          nome: dbv.nome,
          nomePublico: dbv.nomePublico,
          unidade: unidade ? { id: unidade.id, nome: unidade.nome } : null,
          classe: classe ? refClasse(classe) : null,
          pontos: pontos.get(dbv.id) ?? 0,
          frequencia: frequenciaInteira(chamadas.get(dbv.id) ?? []),
        }
      })
      .sort(comparar)
  }

  /** Pontos e frequencia de um DBV no mes, qualquer que seja o tipo ou a situacao dele. */
  async resumoDoDbv(clubeId: string, dbvId: string, mes: string): Promise<{ pontos: number; frequencia: number | null }> {
    const pontos = await this.pontosPorDbv(clubeId, [dbvId], mes)
    const chamadas = await this.situacoesPorDbv(clubeId, [dbvId], mes)
    return { pontos: pontos.get(dbvId) ?? 0, frequencia: frequenciaInteira(chamadas.get(dbvId) ?? []) }
  }

  /** Media de pontos por DBV ativo membro atual; unidade sem DBV fica de fora. Ordem: media, nome. */
  async unidades(clubeId: string, mes: string, anoClube: number): Promise<MediaDaUnidade[]> {
    const unidades = await this.prisma.unidade.findMany({ where: { clubeId, ativa: true }, select: { id: true, nome: true } })
    const entradas = await this.doMes(clubeId, mes, anoClube)
    const porUnidade = agrupar(
      entradas.filter((entrada) => entrada.unidade !== null),
      (entrada) => entrada.unidade?.id ?? '',
    )
    return unidades
      .flatMap((unidade): MediaDaUnidade[] => {
        const membros = porUnidade.get(unidade.id) ?? []
        if (membros.length === 0) return []
        const total = membros.reduce((soma, membro) => soma + membro.pontos, 0)
        return [{ unidade, mediaPontos: Math.round((total / membros.length) * 100) / 100, totalDbvs: membros.length }]
      })
      .sort((a, b) => b.mediaPontos - a.mediaPontos || colador.compare(a.unidade.nome, b.unidade.nome))
  }

  /** Frequencia do mes sobre todas as linhas das reunioes da unidade (E13). */
  async frequenciaDaUnidade(clubeId: string, unidadeId: string, mes: string): Promise<number | null> {
    const { inicio, fim } = limitesDoMes(mes)
    const linhas = await this.prisma.chamada.findMany({
      where: { clubeId, reuniao: { clubeId, unidadeId, data: { gte: inicio, lt: fim } } },
      select: { situacao: true },
    })
    return frequenciaInteira(linhas.map((linha) => linha.situacao))
  }

  private async pontosPorDbv(clubeId: string, dbvIds: string[], mes: string): Promise<Map<string, number>> {
    const { inicio, fim } = limitesDoMes(mes)
    const somas = await this.prisma.lancamentoPontos.groupBy({
      by: ['dbvId'],
      where: { clubeId, dbvId: { in: dbvIds }, estornadoEm: null, data: { gte: inicio, lt: fim } },
      _sum: { pontos: true },
    })
    return new Map(somas.map((soma) => [soma.dbvId, soma._sum.pontos ?? 0]))
  }

  private async situacoesPorDbv(clubeId: string, dbvIds: string[], mes: string): Promise<Map<string, SituacaoChamada[]>> {
    const { inicio, fim } = limitesDoMes(mes)
    const linhas = await this.prisma.chamada.findMany({
      where: { clubeId, dbvId: { in: dbvIds }, reuniao: { clubeId, data: { gte: inicio, lt: fim } } },
      select: { dbvId: true, situacao: true },
    })
    const porDbv = agrupar(linhas, (linha) => linha.dbvId)
    return new Map([...porDbv].map(([dbvId, grupo]) => [dbvId, grupo.map((linha) => linha.situacao)]))
  }
}
