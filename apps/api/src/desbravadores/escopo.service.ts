import { Injectable } from '@nestjs/common'
import { anoClube, hojeNoFuso, permissoesEfetivas, type ChavePermissao } from '@desbravadores/shared'
import type { Prisma } from '../generated/prisma/client.js'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { PrismaService } from '../comum/prisma/prisma.service'

/** "Hoje" e o ano do clube, no fuso e no inicio de ano configurados pelo clube. */
export interface RelogioDoClube {
  hoje: string
  anoClube: number
  inicioAnoClube: string
}

/** Escopo por papel (SPEC 6.2): o que cada papel enxerga de desbravadores e unidades. */
@Injectable()
export class ServicoEscopo {
  constructor(private readonly prisma: PrismaService) {}

  async relogio(clubeId: string, agora: Date = new Date()): Promise<RelogioDoClube> {
    const configuracao = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } })
    const hoje = hojeNoFuso(configuracao.fuso, agora)
    return { hoje, anoClube: anoClube(hoje, configuracao.inicioAnoClube), inicioAnoClube: configuracao.inicioAnoClube }
  }

  async permissoes(sessao: SessaoLogada): Promise<ChavePermissao[]> {
    const ajustes = await this.prisma.permissaoAjuste.findMany({
      where: { vinculoId: sessao.vinculoId },
      select: { permissao: true, concedida: true },
    })
    return permissoesEfetivas(sessao.papel, ajustes)
  }

  async unidadesDoConselheiro(sessao: SessaoLogada): Promise<string[]> {
    const ligacoes = await this.prisma.vinculoUnidade.findMany({
      where: { clubeId: sessao.clubeId, vinculoId: sessao.vinculoId },
      select: { unidadeId: true },
    })
    return ligacoes.map((ligacao) => ligacao.unidadeId)
  }

  async classesDoInstrutor(sessao: SessaoLogada): Promise<string[]> {
    const ligacoes = await this.prisma.vinculoClasse.findMany({
      where: { vinculoId: sessao.vinculoId },
      select: { classeId: true },
    })
    return ligacoes.map((ligacao) => ligacao.classeId)
  }

  /** Filtro de `Desbravador` que o papel alcanca; sempre carrega o `clubeId`. */
  async filtroDesbravadores(sessao: SessaoLogada, relogio: RelogioDoClube): Promise<Prisma.DesbravadorWhereInput> {
    const { clubeId } = sessao
    if (sessao.papel === 'CONSELHEIRO') {
      const unidadeIds = await this.unidadesDoConselheiro(sessao)
      return { clubeId, tipo: 'DBV', membros: { some: { clubeId, unidadeId: { in: unidadeIds }, fim: null } } }
    }
    if (sessao.papel === 'INSTRUTOR') {
      const classeIds = await this.classesDoInstrutor(sessao)
      return { clubeId, matriculas: { some: { clubeId, classeId: { in: classeIds }, anoClube: relogio.anoClube } } }
    }
    return { clubeId }
  }
}
