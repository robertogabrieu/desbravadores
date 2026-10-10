import { Injectable } from '@nestjs/common'
import type { PacoteClasseBiblica } from '@desbravadores/shared'
import type { z } from 'zod'
import { ServicoEscopoGrupos } from '../classe-biblica/escopo-grupos'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { PrismaService } from '../comum/prisma/prisma.service'
import { colador, daDataCivil, paraDataCivil } from '../desbravadores/apoio'

type Pacote = z.infer<typeof PacoteClasseBiblica>
type GrupoDoPacote = Pacote['grupos'][number]

const DIAS_DA_JANELA = 7

function somarDias(data: string, dias: number): string {
  return paraDataCivil(new Date(daDataCivil(data).getTime() + dias * 86_400_000))
}

/**
 * O que a chamada da Classe Bíblica precisa sem internet (D8): só para quem tem `classebiblica.chamada`,
 * encontros não cancelados de hoje−7 a hoje+7, cortados pelo escopo (regra 9). Ordem estável para a `versao` do pacote.
 */
@Injectable()
export class PacoteClasseBiblicaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopoGrupos: ServicoEscopoGrupos,
  ) {}

  async montar(sessao: SessaoLogada, hoje: string): Promise<Pacote | null> {
    const { chamada } = await this.escopoGrupos.permissoes(sessao)
    if (!chamada) return null
    const { clubeId } = sessao
    const desde = daDataCivil(somarDias(hoje, -DIAS_DA_JANELA))
    const ate = daDataCivil(somarDias(hoje, DIAS_DA_JANELA))

    const encontros = await this.prisma.encontroClasseBiblica.findMany({
      where: { clubeId, canceladoEm: null, data: { gte: desde, lte: ate }, edicao: { clubeId, terminadaEm: { not: null } } },
      select: { id: true, edicaoId: true, data: true, horario: true, local: true, dataOriginal: true, edicao: { select: { nome: true } } },
      orderBy: [{ data: 'asc' }, { id: 'asc' }],
    })
    const edicaoIds = [...new Set(encontros.map((encontro) => encontro.edicaoId))]
    const grupoIds: string[] = []
    for (const edicaoId of edicaoIds) grupoIds.push(...(await this.escopoGrupos.gruposVisiveis(sessao, edicaoId)))
    const encontroIds = encontros.map((encontro) => encontro.id)

    const grupos = await this.grupos(sessao, grupoIds, encontros, desde, ate)
    const [presencas, chamadas] = await Promise.all([
      this.prisma.presencaClasseBiblica.findMany({
        where: { clubeId, encontroId: { in: encontroIds }, grupoId: { in: grupoIds } },
        select: { encontroId: true, dbvId: true, presente: true, participou: true, versao: true },
        orderBy: [{ encontroId: 'asc' }, { dbvId: 'asc' }],
      }),
      this.prisma.chamadaClasseBiblica.findMany({
        where: { clubeId, encontroId: { in: encontroIds }, grupoId: { in: grupoIds } },
        select: { encontroId: true, grupoId: true },
        orderBy: [{ encontroId: 'asc' }, { grupoId: 'asc' }],
      }),
    ])
    const visiveis = await this.escopoGrupos.dbvsNoEscopo(sessao, [...new Set(presencas.map((linha) => linha.dbvId))])

    return {
      encontros: encontros.map((encontro) => ({
        id: encontro.id,
        edicaoId: encontro.edicaoId,
        edicaoNome: encontro.edicao.nome ?? '',
        data: paraDataCivil(encontro.data),
        horario: encontro.horario,
        local: encontro.local,
        dataOriginal: encontro.dataOriginal ? paraDataCivil(encontro.dataOriginal) : null,
      })),
      grupos,
      presencas: presencas
        .filter((linha) => visiveis.has(linha.dbvId))
        .map((linha) => ({ ...linha, versao: linha.versao.toISOString() })),
      chamadasRegistradas: chamadas,
    }
  }

  /** Grupos do escopo com as unidades e os membros que passaram por elas na janela, com início e fim (regra 8 no aparelho). */
  private async grupos(
    sessao: SessaoLogada,
    grupoIds: string[],
    encontros: { id: string; edicaoId: string }[],
    desde: Date,
    ate: Date,
  ): Promise<GrupoDoPacote[]> {
    if (grupoIds.length === 0) return []
    const { clubeId } = sessao
    const grupos = await this.prisma.grupoClasseBiblica.findMany({
      where: { clubeId, id: { in: grupoIds } },
      select: {
        id: true,
        nome: true,
        edicaoId: true,
        unidades: { where: { clubeId }, select: { unidadeId: true, unidade: { select: { nome: true } } } },
      },
    })
    const unidadeIds = [...new Set(grupos.flatMap((grupo) => grupo.unidades.map((unidade) => unidade.unidadeId)))]
    const membros = await this.prisma.membroUnidade.findMany({
      where: {
        clubeId,
        unidadeId: { in: unidadeIds },
        inicio: { lte: ate },
        OR: [{ fim: null }, { fim: { gt: desde } }],
        dbv: { clubeId, ativo: true },
      },
      select: { dbvId: true, unidadeId: true, inicio: true, fim: true, dbv: { select: { nome: true } } },
    })
    const visiveis = await this.escopoGrupos.dbvsNoEscopo(sessao, [...new Set(membros.map((membro) => membro.dbvId))])
    const doEscopo = membros
      .filter((membro) => visiveis.has(membro.dbvId))
      .sort((a, b) => colador.compare(a.dbv.nome, b.dbv.nome) || a.dbvId.localeCompare(b.dbvId) || a.inicio.getTime() - b.inicio.getTime())

    const porId = new Map(grupos.map((grupo) => [grupo.id, grupo]))
    return grupoIds.flatMap((grupoId) => {
      const grupo = porId.get(grupoId)
      if (!grupo) return []
      const unidades = grupo.unidades
        .map((ligacao) => ({
          id: ligacao.unidadeId,
          nome: ligacao.unidade.nome,
          membros: doEscopo
            .filter((membro) => membro.unidadeId === ligacao.unidadeId)
            .map((membro) => ({
              dbvId: membro.dbvId,
              nome: membro.dbv.nome,
              inicio: paraDataCivil(membro.inicio),
              fim: membro.fim ? paraDataCivil(membro.fim) : null,
            })),
        }))
        .filter((unidade) => unidade.membros.length > 0)
        .sort((a, b) => colador.compare(a.nome, b.nome) || a.id.localeCompare(b.id))
      return [{
        id: grupo.id,
        encontroIds: encontros.filter((encontro) => encontro.edicaoId === grupo.edicaoId).map((encontro) => encontro.id),
        nome: grupo.nome,
        unidades,
      }]
    })
  }
}
