import { Injectable } from '@nestjs/common'
import type { ChavePermissao } from '@desbravadores/shared'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import type { Prisma } from '../generated/prisma/client.js'

export const EDICAO_NAO_ENCONTRADA = 'Edição não encontrada.'
export const GRUPO_NAO_ENCONTRADO = 'Grupo não encontrado.'

/** O que se corta pelo escopo: o desbravador e a unidade em que ele conta (a da linha gravada, ou a da composição na data). */
export interface ItemDoEscopo {
  dbvId: string
  unidadeId: string
}

/** Corte de quem só tem a chamada (regra 9, D33). */
export interface CorteDoEscopo {
  /** Conselheiro: pela unidade do item, nunca pela de hoje; Instrutor: pelos CURSANDO das classes dele. */
  itens: <T extends ItemDoEscopo>(itens: T[]) => Promise<T[]>
  /** Das unidades dadas, as que a pessoa pode ver nomeadas no painel. */
  unidades: (unidadeIds: string[]) => Promise<Set<string>>
}

/** O que a guarda própria do painel apurou: o que a pessoa pode e quais grupos ela enxerga. */
export interface AcessoAoPainel {
  podeGerenciar: boolean
  podeFazerChamada: boolean
  /** Grupos não removidos da edição que a pessoa vê, na ordem da edição. */
  grupoIds: string[]
  /** null = vê todos os desbravadores e todas as unidades. */
  corte: CorteDoEscopo | null
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

  /** Corte da sessão; null para quem vê tudo (gerenciar ou Adm). */
  async corte(sessao: SessaoLogada): Promise<CorteDoEscopo | null> {
    const { gerenciar } = await this.permissoes(sessao)
    return gerenciar || sessao.papel === 'ADM' ? null : this.corteSemVerTudo(sessao)
  }

  private corteSemVerTudo(sessao: SessaoLogada): CorteDoEscopo {
    const { clubeId } = sessao
    if (sessao.papel === 'CONSELHEIRO') {
      const unidadesDele = this.escopo.unidadesDoConselheiro(sessao).then((ids) => new Set(ids))
      return {
        itens: async (itens) => {
          const dele = await unidadesDele
          return itens.filter((item) => dele.has(item.unidadeId))
        },
        unidades: async (unidadeIds) => {
          const dele = await unidadesDele
          return new Set(unidadeIds.filter((id) => dele.has(id)))
        },
      }
    }
    if (sessao.papel === 'INSTRUTOR') {
      // Um corte serve a uma montagem inteira (o pacote corta encontro por encontro): filtro e respostas ficam guardados.
      let filtro: Promise<Prisma.DesbravadorWhereInput> | undefined
      const doInstrutor = () => (filtro ??= this.filtroDoInstrutor(sessao))
      const conferidos = new Map<string, boolean>()
      return {
        itens: async (itens) => {
          const faltam = [...new Set(itens.map((item) => item.dbvId))].filter((dbvId) => !conferidos.has(dbvId))
          if (faltam.length > 0) {
            const visiveis = await this.prisma.desbravador.findMany({
              where: { clubeId, id: { in: faltam }, ...(await doInstrutor()) },
              select: { id: true },
            })
            const ids = new Set(visiveis.map((v) => v.id))
            for (const dbvId of faltam) conferidos.set(dbvId, ids.has(dbvId))
          }
          return itens.filter((item) => conferidos.get(item.dbvId) === true)
        },
        unidades: async (unidadeIds) => {
          if (unidadeIds.length === 0) return new Set()
          const membros = await this.prisma.membroUnidade.findMany({
            where: { clubeId, unidadeId: { in: unidadeIds }, fim: null, dbv: { clubeId, ativo: true, ...(await doInstrutor()) } },
            select: { unidadeId: true },
          })
          return new Set(membros.map((membro) => membro.unidadeId))
        },
      }
    }
    return { itens: () => Promise.resolve([]), unidades: () => Promise.resolve(new Set()) }
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
      corte: veTudo ? null : this.corteSemVerTudo(sessao),
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

  /** Conselheiro: grupo em que uma unidade dele está ou esteve (D33). Instrutor: pela composição de hoje. */
  private async filtroDeGrupo(sessao: SessaoLogada): Promise<Prisma.GrupoClasseBiblicaWhereInput | null> {
    const { clubeId } = sessao
    if (sessao.papel === 'CONSELHEIRO') {
      const unidadeIds = await this.escopo.unidadesDoConselheiro(sessao)
      return { unidades: { some: { clubeId, unidadeId: { in: unidadeIds } } } }
    }
    if (sessao.papel !== 'INSTRUTOR') return null
    const dbv = await this.filtroDoInstrutor(sessao)
    return { unidades: { some: { clubeId, fim: null, unidade: { membros: { some: { clubeId, fim: null, dbv: { clubeId, ativo: true, ...dbv } } } } } } }
  }

  private async filtroDoInstrutor(sessao: SessaoLogada): Promise<Prisma.DesbravadorWhereInput> {
    const { clubeId } = sessao
    const [classeIds, relogio] = await Promise.all([this.escopo.classesDoInstrutor(sessao), this.escopo.relogio(clubeId)])
    return { matriculas: { some: { clubeId, classeId: { in: classeIds }, anoClube: relogio.anoClube, status: 'CURSANDO' } } }
  }
}
