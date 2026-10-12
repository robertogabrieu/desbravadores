import { Injectable } from '@nestjs/common'
import { frequencia, type SituacaoChamada } from '@desbravadores/shared'
import type { RefClasse, RefUnidade } from '@desbravadores/shared'
import type { z } from 'zod'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import { colador, daDataCivil } from '../desbravadores/apoio'
import { PrismaService } from '../comum/prisma/prisma.service'
import type { Prisma } from '../generated/prisma/client.js'

export interface EntradaDoRanking {
  dbvId: string
  nome: string
  nomePublico: string
  unidade: z.infer<typeof RefUnidade> | null
  classe: z.infer<typeof RefClasse> | null
  pontos: number
  frequencia: number | null
}

/** Uma pessoa da lista de quem era desbravador no mes, com a unidade que o ranking mostra. */
export interface FichaDoRoster {
  id: string
  nome: string
  nomePublico: string
  unidade: z.infer<typeof RefUnidade> | null
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

/**
 * Quem era desbravador no mes: DBV ativo, com a unidade atual; ou Diretoria que so entrou depois do fim do mes
 * e era DBV na vespera da entrada, com a unidade que tinha entao (gravada na troca de Tipo, nula se nao tinha).
 * Aparece como aparecia antes de entrar. `entradaAte` deixa de fora quem entrou no clube depois desse dia.
 * Recebe o client de quem chama: dentro de uma transacao, outro client tomaria uma segunda conexao do pool.
 */
export async function rosterDoMes(
  db: Pick<Prisma.TransactionClient, 'desbravador'>,
  clubeId: string,
  mes: string,
  opcoes: { entradaAte?: Date } = {},
): Promise<FichaDoRoster[]> {
  const { fim: fimDoMes } = limitesDoMes(mes)
  const fichas = await db.desbravador.findMany({
    where: {
      clubeId,
      ativo: true,
      ...(opcoes.entradaAte ? { entradaEm: { lte: opcoes.entradaAte } } : {}),
      OR: [{ tipo: 'DBV' }, { tipo: 'DIRETORIA', diretoriaVeioDeDbv: true, diretoriaDesde: { gte: fimDoMes } }],
    },
    select: {
      id: true,
      nome: true,
      nomePublico: true,
      tipo: true,
      diretoriaUnidadeAnterior: { select: { id: true, nome: true } },
      membros: { where: { clubeId, fim: null }, select: { unidade: { select: { id: true, nome: true } } } },
    },
  })
  return fichas.map((ficha) => {
    const unidade = ficha.tipo === 'DIRETORIA' ? ficha.diretoriaUnidadeAnterior : ficha.membros[0]?.unidade
    return { id: ficha.id, nome: ficha.nome, nomePublico: ficha.nomePublico, unidade: unidade ? { id: unidade.id, nome: unidade.nome } : null }
  })
}

/** Pontos e frequencia do mes (E13, E14). Nao decide quem pode ver nome ou frequencia: isso e do escopo. */
@Injectable()
export class CalculoRanking {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Quem era desbravador no mes, ja na ordem do ranking: a regra de `rosterDoMes` com a classe regular do ano,
   * os pontos e a frequencia. `unidadeId` filtra por essa unidade.
   */
  async doMes(clubeId: string, mes: string, anoClube: number, unidadeId?: string): Promise<EntradaDoRanking[]> {
    const fichas = await rosterDoMes(this.prisma, clubeId, mes)
    const dbvs = unidadeId ? fichas.filter((dbv) => dbv.unidade?.id === unidadeId) : fichas
    const dbvIds = dbvs.map((dbv) => dbv.id)
    const classes = await this.classesPorDbv(clubeId, dbvIds, anoClube)
    const pontos = await this.pontosPorDbv(clubeId, dbvIds, mes)
    const chamadas = await this.situacoesPorDbv(clubeId, dbvIds, mes)

    return dbvs
      .map(
        (dbv): EntradaDoRanking => ({
          dbvId: dbv.id,
          nome: dbv.nome,
          nomePublico: dbv.nomePublico,
          unidade: dbv.unidade,
          classe: classes.get(dbv.id) ?? null,
          pontos: pontos.get(dbv.id) ?? 0,
          frequencia: frequenciaInteira(chamadas.get(dbv.id) ?? []),
        }),
      )
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

  /** A classe regular que cada um cursa no ano do clube; quem nao cursa nenhuma fica de fora do mapa. */
  private async classesPorDbv(clubeId: string, dbvIds: string[], anoClube: number): Promise<Map<string, z.infer<typeof RefClasse>>> {
    const matriculas = await this.prisma.matriculaClasse.findMany({
      where: { clubeId, dbvId: { in: dbvIds }, anoClube, status: 'CURSANDO', classe: { tipo: 'REGULAR' } },
      select: { dbvId: true, classe: { select: SELECAO_REF_CLASSE } },
    })
    const classes = new Map<string, z.infer<typeof RefClasse>>()
    for (const matricula of matriculas) {
      if (!classes.has(matricula.dbvId)) classes.set(matricula.dbvId, refClasse(matricula.classe))
    }
    return classes
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
