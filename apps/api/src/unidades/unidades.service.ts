import { Injectable } from '@nestjs/common'
import {
  frequencia,
  idade,
  type GradeFrequenciaFiltro,
  type GradeFrequenciaSaida,
  type MembroSaida,
  type UnidadeCriarEntrada,
  type UnidadeEditarEntrada,
  type UnidadeFiltro,
  type UnidadeSaida,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { colador, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo, type RelogioDoClube } from '../desbravadores/escopo.service'
import type { Prisma } from '../generated/prisma/client.js'

type Unidade = z.infer<typeof UnidadeSaida>
type Membro = z.infer<typeof MembroSaida>
type Grade = z.infer<typeof GradeFrequenciaSaida>

const MARCA_POR_SITUACAO = { PRESENTE: 'P', ATRASADO: 'A', FALTA: 'F', FALTA_JUSTIFICADA: 'J' } as const

const INCLUIR_UNIDADE = {
  vinculos: {
    where: { vinculo: { ativo: true, papel: 'CONSELHEIRO' } },
    include: { vinculo: { select: { usuario: { select: { id: true, nome: true } } } } },
  },
  _count: { select: { membros: { where: { fim: null, dbv: { tipo: 'DBV', ativo: true } } } } },
} satisfies Prisma.UnidadeInclude

type UnidadeCompleta = Prisma.UnidadeGetPayload<{ include: typeof INCLUIR_UNIDADE }>

function montarUnidade(unidade: UnidadeCompleta): Unidade {
  return {
    id: unidade.id,
    nome: unidade.nome,
    tipo: unidade.tipo,
    gritoDeGuerra: unidade.gritoDeGuerra,
    ativa: unidade.ativa,
    conselheiros: unidade.vinculos
      .map((ligacao) => ({ usuarioId: ligacao.vinculo.usuario.id, nome: ligacao.vinculo.usuario.nome }))
      .sort((a, b) => colador.compare(a.nome, b.nome)),
    totalMembros: unidade._count.membros,
  }
}

const INCLUIR_CLASSE_ATUAL = (anoClube: number) =>
  ({
    matriculas: {
      where: { anoClube, status: 'CURSANDO', classe: { tipo: 'REGULAR' } },
      orderBy: { classe: { ordem: 'asc' } },
      take: 1,
      include: { classe: { select: SELECAO_REF_CLASSE } },
    },
  }) satisfies Prisma.DesbravadorInclude

type DbvComClasse = Prisma.DesbravadorGetPayload<{ include: ReturnType<typeof INCLUIR_CLASSE_ATUAL> }>

function montarMembro(dbv: DbvComClasse, desde: Date, relogio: RelogioDoClube): Membro {
  const classe = dbv.matriculas[0]?.classe
  return {
    dbvId: dbv.id,
    nome: dbv.nome,
    nomePublico: dbv.nomePublico,
    idade: idade(paraDataCivil(dbv.nascimento), relogio.hoje),
    sexo: dbv.sexo,
    classeAtual: classe ? refClasse(classe) : null,
    desde: paraDataCivil(desde),
  }
}

@Injectable()
export class UnidadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
  ) {}

  async listar(sessao: SessaoLogada, filtro: z.infer<typeof UnidadeFiltro>): Promise<Unidade[]> {
    const { clubeId } = sessao
    if (sessao.papel === 'INSTRUTOR') return []
    const where: Prisma.UnidadeWhereInput =
      sessao.papel === 'ADM'
        ? { clubeId, ...(filtro.todas ? {} : { ativa: true }) }
        : { clubeId, ativa: true, id: { in: await this.escopo.unidadesDoConselheiro(sessao) } }
    const unidades = await this.prisma.unidade.findMany({ where, include: INCLUIR_UNIDADE })
    return unidades.map(montarUnidade).sort((a, b) => colador.compare(a.nome, b.nome))
  }

  /** Unidade do clube no escopo de quem pede; inativa só para o ADM, como a lista. */
  async obter(sessao: SessaoLogada, id: string): Promise<Unidade> {
    await this.exigirNoEscopo(sessao, id)
    const unidade = await this.prisma.unidade.findFirst({
      where: { id, clubeId: sessao.clubeId, ...(sessao.papel === 'ADM' ? {} : { ativa: true }) },
      include: INCLUIR_UNIDADE,
    })
    if (!unidade) throw new ErroApp('NAO_ENCONTRADO', 'Unidade não encontrada.')
    return montarUnidade(unidade)
  }

  async membros(sessao: SessaoLogada, unidadeId: string): Promise<Membro[]> {
    const { clubeId } = sessao
    await this.exigirNoEscopo(sessao, unidadeId)
    const relogio = await this.escopo.relogio(clubeId)
    const passagens = await this.prisma.membroUnidade.findMany({
      where: { clubeId, unidadeId, fim: null, dbv: { tipo: 'DBV', ativo: true } },
      include: { dbv: { include: INCLUIR_CLASSE_ATUAL(relogio.anoClube) } },
    })
    const membros = passagens.map((passagem) => montarMembro(passagem.dbv, passagem.inicio, relogio))
    const frequencias = (await this.escopo.permissoes(sessao)).includes('reuniao.ver')
      ? await this.frequenciaDoMes(clubeId, relogio.hoje, membros.map((membro) => membro.dbvId))
      : null
    return membros
      .map((membro) => (frequencias ? { ...membro, frequencia: frequencias.get(membro.dbvId) ?? null } : membro))
      .sort((a, b) => colador.compare(a.nome, b.nome))
  }

  /** Grade das ultimas reunioes da unidade (SPEC Fase 1, E13): linhas = membros DBV atuais. */
  async grade(sessao: SessaoLogada, unidadeId: string, filtro: z.infer<typeof GradeFrequenciaFiltro>): Promise<Grade> {
    const { clubeId } = sessao
    await this.exigirNoEscopo(sessao, unidadeId)
    const recentes = await this.prisma.reuniao.findMany({
      where: { clubeId, unidadeId },
      orderBy: { data: 'desc' },
      take: filtro.ultimas,
      include: { chamadas: { where: { clubeId }, select: { dbvId: true, situacao: true } } },
    })
    const reunioes = recentes.reverse()
    const membros = await this.prisma.membroUnidade.findMany({
      where: { clubeId, unidadeId, fim: null, dbv: { tipo: 'DBV', ativo: true } },
      select: { dbv: { select: { id: true, nome: true } } },
    })
    const linhas = membros
      .map((membro) => membro.dbv)
      .sort((a, b) => colador.compare(a.nome, b.nome) || a.id.localeCompare(b.id))
      .map((dbv) => {
        const situacoes = reunioes.map((reuniao) => reuniao.chamadas.find((linha) => linha.dbvId === dbv.id)?.situacao ?? null)
        const registradas = situacoes.filter((situacao) => situacao !== null)
        const percentual = frequencia(registradas)
        return {
          dbvId: dbv.id,
          nome: dbv.nome,
          marcas: situacoes.map((situacao) => (situacao ? MARCA_POR_SITUACAO[situacao] : null)),
          percentual: percentual === null ? null : Math.round(percentual),
        }
      })
    return { reunioes: reunioes.map((reuniao) => ({ id: reuniao.id, data: paraDataCivil(reuniao.data) })), linhas }
  }

  /** Frequencia de cada DBV sobre as linhas de chamada do mes civil de `hoje`; sem linha, fora do mapa. */
  private async frequenciaDoMes(clubeId: string, hoje: string, dbvIds: string[]): Promise<Map<string, number>> {
    const inicio = new Date(`${hoje.slice(0, 7)}-01T00:00:00Z`)
    const fim = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1))
    const linhas = await this.prisma.chamada.findMany({
      where: { clubeId, dbvId: { in: dbvIds }, reuniao: { clubeId, data: { gte: inicio, lt: fim } } },
      select: { dbvId: true, situacao: true },
    })
    const porDbv = new Map<string, typeof linhas>()
    for (const linha of linhas) porDbv.set(linha.dbvId, [...(porDbv.get(linha.dbvId) ?? []), linha])
    const resultado = new Map<string, number>()
    for (const [dbvId, doDbv] of porDbv) {
      const valor = frequencia(doDbv.map((linha) => linha.situacao))
      if (valor !== null) resultado.set(dbvId, Math.round(valor))
    }
    return resultado
  }

  async semMembros(sessao: SessaoLogada): Promise<Membro[]> {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const soltos = await this.prisma.desbravador.findMany({
      where: { clubeId, tipo: 'DBV', ativo: true, membros: { none: { fim: null } } },
      include: {
        ...INCLUIR_CLASSE_ATUAL(relogio.anoClube),
        membros: { orderBy: { fim: 'desc' }, take: 1 },
      },
    })
    return soltos
      .map((dbv) => montarMembro(dbv, dbv.membros[0]?.fim ?? dbv.entradaEm, relogio))
      .sort((a, b) => colador.compare(a.nome, b.nome))
  }

  async criar(sessao: SessaoLogada, entrada: z.infer<typeof UnidadeCriarEntrada>): Promise<Unidade> {
    const { clubeId } = sessao
    await this.exigirNomeLivre(clubeId, entrada.nome)
    const unidade = await this.prisma.unidade.create({
      data: { clubeId, nome: entrada.nome, tipo: entrada.tipo, gritoDeGuerra: entrada.gritoDeGuerra ?? null },
    })
    return this.carregar(clubeId, unidade.id)
  }

  async editar(sessao: SessaoLogada, id: string, entrada: z.infer<typeof UnidadeEditarEntrada>): Promise<Unidade> {
    const { clubeId } = sessao
    const atual = await this.prisma.unidade.findFirst({ where: { id, clubeId } })
    if (!atual) throw new ErroApp('NAO_ENCONTRADO', 'Unidade não encontrada.')
    if (entrada.nome !== undefined) await this.exigirNomeLivre(clubeId, entrada.nome, id)
    if (entrada.ativa === false && atual.ativa) {
      const abertos = await this.prisma.membroUnidade.count({ where: { clubeId, unidadeId: id, fim: null } })
      if (abertos > 0) throw new ErroApp('REGRA', 'Mova os membros antes de desativar')
    }
    await this.prisma.unidade.update({
      where: { id, clubeId },
      data: { nome: entrada.nome, tipo: entrada.tipo, gritoDeGuerra: entrada.gritoDeGuerra, ativa: entrada.ativa },
    })
    return this.carregar(clubeId, id)
  }

  private async carregar(clubeId: string, id: string): Promise<Unidade> {
    const unidade = await this.prisma.unidade.findFirstOrThrow({ where: { id, clubeId }, include: INCLUIR_UNIDADE })
    return montarUnidade(unidade)
  }

  /** ADM alcanca qualquer unidade do clube; conselheiro so as suas; instrutor nenhuma. */
  private async exigirNoEscopo(sessao: SessaoLogada, unidadeId: string): Promise<void> {
    const alcanca =
      sessao.papel === 'ADM' ||
      (sessao.papel === 'CONSELHEIRO' && (await this.escopo.unidadesDoConselheiro(sessao)).includes(unidadeId))
    const unidade = alcanca
      ? await this.prisma.unidade.findFirst({ where: { id: unidadeId, clubeId: sessao.clubeId }, select: { id: true } })
      : null
    if (!unidade) throw new ErroApp('NAO_ENCONTRADO', 'Unidade não encontrada.')
  }

  private async exigirNomeLivre(clubeId: string, nome: string, ignorarId?: string): Promise<void> {
    const repetida = await this.prisma.unidade.findFirst({
      where: { clubeId, nome: { equals: nome, mode: 'insensitive' }, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
      select: { id: true },
    })
    if (repetida) throw new ErroApp('CONFLITO', 'Já existe uma unidade com esse nome.')
  }
}
