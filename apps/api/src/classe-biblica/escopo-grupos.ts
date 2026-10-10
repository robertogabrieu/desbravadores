import { Injectable } from '@nestjs/common'
import type { ChavePermissao } from '@desbravadores/shared'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import type { Prisma } from '../generated/prisma/client.js'

export const EDICAO_NAO_ENCONTRADA = 'Edição não encontrada.'
export const GRUPO_NAO_ENCONTRADO = 'Grupo não encontrado.'

/** O que a guarda própria do painel apurou: o que a pessoa pode e quais grupos ela enxerga. */
export interface AcessoAoPainel {
  podeGerenciar: boolean
  podeFazerChamada: boolean
  /** Grupos não removidos da edição que a pessoa vê, na ordem da edição. */
  grupoIds: string[]
  /** null = vê todos os desbravadores; senão, só estes (regra 9). */
  dbvsVisiveis: ((dbvIds: string[]) => Promise<Set<string>>) | null
}

/** Escopo da Classe Bíblica (regra 9): o Adm vê tudo; Conselheiro pelas unidades; Instrutor pelos CURSANDO das classes dele. */
@Injectable()
export class ServicoEscopoGrupos {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
  ) {}

  async permissoes(sessao: SessaoLogada): Promise<{ gerenciar: boolean; chamada: boolean }> {
    const efetivas: ChavePermissao[] = await this.escopo.permissoes(sessao)
    return { gerenciar: efetivas.includes('classebiblica.gerenciar'), chamada: efetivas.includes('classebiblica.chamada') }
  }

  /** Grupos não removidos da edição que a sessão enxerga, por ordem. Sem `classebiblica.chamada` nem gerenciar: nenhum. */
  async gruposVisiveis(sessao: SessaoLogada, edicaoId: string): Promise<string[]> {
    const { gerenciar, chamada } = await this.permissoes(sessao)
    if (!gerenciar && !chamada) return []
    const filtro = gerenciar || sessao.papel === 'ADM' ? {} : await this.filtroDeGrupo(sessao)
    if (filtro === null) return []
    const grupos = await this.prisma.grupoClasseBiblica.findMany({
      where: { clubeId: sessao.clubeId, edicaoId, removidoEm: null, ...filtro },
      select: { id: true },
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
    })
    return grupos.map((grupo) => grupo.id)
  }

  /** Dos desbravadores dados, os que a sessão alcança na chamada (regra 9). */
  async dbvsNoEscopo(sessao: SessaoLogada, dbvIds: string[]): Promise<Set<string>> {
    if (dbvIds.length === 0) return new Set()
    const { gerenciar } = await this.permissoes(sessao)
    const filtro = gerenciar || sessao.papel === 'ADM' ? {} : await this.filtroDeDbv(sessao)
    if (filtro === null) return new Set()
    const dbvs = await this.prisma.desbravador.findMany({
      where: { clubeId: sessao.clubeId, id: { in: dbvIds }, ...filtro },
      select: { id: true },
    })
    return new Set(dbvs.map((dbv) => dbv.id))
  }

  /**
   * Guarda própria do painel e da frequência: gerenciar, ou a chamada com algum grupo no escopo.
   * Edição de outro clube, rascunho para quem não gerencia ou nenhum grupo no escopo: 404.
   */
  async exigirAcesso(sessao: SessaoLogada, edicaoId: string): Promise<AcessoAoPainel> {
    const edicao = await this.prisma.edicaoClasseBiblica.findFirst({
      where: { clubeId: sessao.clubeId, id: edicaoId },
      select: { terminadaEm: true },
    })
    if (!edicao) throw new ErroApp('NAO_ENCONTRADO', EDICAO_NAO_ENCONTRADA)
    const { gerenciar, chamada } = await this.permissoes(sessao)
    if (!gerenciar && !chamada) throw new ErroApp('SEM_PERMISSAO', 'Você não tem permissão para fazer isso.')
    const grupoIds = await this.gruposVisiveis(sessao, edicaoId)
    const veTudo = gerenciar || sessao.papel === 'ADM'
    if (!veTudo && (!edicao.terminadaEm || grupoIds.length === 0)) throw new ErroApp('NAO_ENCONTRADO', EDICAO_NAO_ENCONTRADA)
    return {
      podeGerenciar: gerenciar,
      podeFazerChamada: chamada,
      grupoIds,
      dbvsVisiveis: veTudo ? null : (dbvIds) => this.dbvsNoEscopo(sessao, dbvIds),
    }
  }

  /** Grupo no escopo da sessão, com a edição dele; fora do clube ou do escopo, 404. */
  async exigirGrupo(sessao: SessaoLogada, grupoId: string): Promise<{ grupo: { id: string; nome: string; edicaoId: string }; acesso: AcessoAoPainel }> {
    const grupo = await this.prisma.grupoClasseBiblica.findFirst({
      where: { clubeId: sessao.clubeId, id: grupoId, removidoEm: null },
      select: { id: true, nome: true, edicaoId: true },
    })
    if (!grupo) throw new ErroApp('NAO_ENCONTRADO', GRUPO_NAO_ENCONTRADO)
    const acesso = await this.exigirAcesso(sessao, grupo.edicaoId)
    if (!acesso.grupoIds.includes(grupo.id)) throw new ErroApp('NAO_ENCONTRADO', GRUPO_NAO_ENCONTRADO)
    return { grupo, acesso }
  }

  private async filtroDeGrupo(sessao: SessaoLogada): Promise<Prisma.GrupoClasseBiblicaWhereInput | null> {
    const { clubeId } = sessao
    if (sessao.papel === 'CONSELHEIRO') {
      const unidadeIds = await this.escopo.unidadesDoConselheiro(sessao)
      return { unidades: { some: { clubeId, unidadeId: { in: unidadeIds } } } }
    }
    const dbv = await this.filtroDeDbv(sessao)
    if (dbv === null) return null
    return { unidades: { some: { clubeId, unidade: { membros: { some: { clubeId, fim: null, dbv: { clubeId, ativo: true, ...dbv } } } } } } }
  }

  private async filtroDeDbv(sessao: SessaoLogada): Promise<Prisma.DesbravadorWhereInput | null> {
    const { clubeId } = sessao
    if (sessao.papel === 'CONSELHEIRO') {
      const unidadeIds = await this.escopo.unidadesDoConselheiro(sessao)
      return { membros: { some: { clubeId, unidadeId: { in: unidadeIds }, fim: null } } }
    }
    if (sessao.papel === 'INSTRUTOR') {
      const [classeIds, relogio] = await Promise.all([this.escopo.classesDoInstrutor(sessao), this.escopo.relogio(clubeId)])
      return { matriculas: { some: { clubeId, classeId: { in: classeIds }, anoClube: relogio.anoClube, status: 'CURSANDO' } } }
    }
    return null
  }
}
