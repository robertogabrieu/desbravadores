import { Injectable } from '@nestjs/common'
import type { PacoteClasseBiblica } from '@desbravadores/shared'
import type { z } from 'zod'
import { cobre, linhaDoEncontro, membrosDaChamada, SELECAO_LINHA, SELECAO_VINCULO, unidadesNaData, vinculo, type Vinculo } from '../classe-biblica/composicao'
import { somarDias } from '../classe-biblica/datas'
import { ServicoEscopoGrupos, type CorteDoEscopo } from '../classe-biblica/escopo-grupos'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { PrismaService } from '../comum/prisma/prisma.service'
import { colador, daDataCivil, paraDataCivil } from '../desbravadores/apoio'

type Pacote = z.infer<typeof PacoteClasseBiblica>
type GrupoDoPacote = Pacote['grupos'][number]

const DIAS_DA_JANELA = 7

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

    const corte = await this.escopoGrupos.corte(sessao)
    const grupos = await this.grupos(sessao, grupoIds, encontros, desde, ate, corte)
    const [presencas, chamadas] = await Promise.all([
      this.prisma.presencaClasseBiblica.findMany({
        where: { clubeId, encontroId: { in: encontroIds }, grupoId: { in: grupoIds } },
        select: { encontroId: true, dbvId: true, unidadeId: true, presente: true, participou: true, versao: true },
        orderBy: [{ encontroId: 'asc' }, { dbvId: 'asc' }],
      }),
      this.prisma.chamadaClasseBiblica.findMany({
        where: { clubeId, encontroId: { in: encontroIds }, grupoId: { in: grupoIds } },
        select: { encontroId: true, grupoId: true },
        orderBy: [{ encontroId: 'asc' }, { grupoId: 'asc' }],
      }),
    ])
    const doEscopo = corte ? await corte.itens(presencas) : presencas

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
      presencas: doEscopo.map((linha) => ({
        encontroId: linha.encontroId, dbvId: linha.dbvId, presente: linha.presente, participou: linha.participou, versao: linha.versao.toISOString(),
      })),
      chamadasRegistradas: chamadas,
    }
  }

  /**
   * Grupos do escopo com as unidades e os membros de cada encontro da janela pela mesma regra da lista
   * (`membrosDaChamada`). O aparelho filtra `inicio <= data < fim`: o vínculo vai com as datas reais quando
   * elas dão a mesma lista em todos os encontros do grupo; senão, um intervalo de um dia por encontro.
   */
  private async grupos(
    sessao: SessaoLogada,
    grupoIds: string[],
    encontros: { id: string; edicaoId: string; data: Date }[],
    desde: Date,
    ate: Date,
    corte: CorteDoEscopo | null,
  ): Promise<GrupoDoPacote[]> {
    if (grupoIds.length === 0) return []
    const { clubeId } = sessao
    const [grupos, linhas] = await Promise.all([
      this.prisma.grupoClasseBiblica.findMany({
        where: { clubeId, id: { in: grupoIds } },
        select: { id: true, nome: true, edicaoId: true, unidades: { where: { clubeId }, select: { grupoId: true, unidadeId: true, inicio: true, fim: true } } },
      }),
      this.prisma.presencaClasseBiblica.findMany({
        where: { clubeId, encontroId: { in: encontros.map((encontro) => encontro.id) } },
        select: { ...SELECAO_LINHA, encontroId: true },
      }),
    ])
    const unidadeIds = [...new Set(grupos.flatMap((grupo) => grupo.unidades.map((unidade) => unidade.unidadeId)))]
    const vinculos = (
      await this.prisma.membroUnidade.findMany({
        where: {
          clubeId,
          inicio: { lte: ate },
          AND: [
            { OR: [{ unidadeId: { in: unidadeIds } }, { dbvId: { in: [...new Set(linhas.map((linha) => linha.dbvId))] } }] },
            { OR: [{ fim: null }, { fim: { gt: desde } }] },
          ],
          dbv: { clubeId, ativo: true },
        },
        select: SELECAO_VINCULO,
      })
    ).map(vinculo)

    const porId = new Map(grupos.map((grupo) => [grupo.id, grupo]))
    const resultado: GrupoDoPacote[] = []
    for (const grupoId of grupoIds) {
      const grupo = porId.get(grupoId)
      if (!grupo) continue
      const doGrupo = encontros.filter((encontro) => encontro.edicaoId === grupo.edicaoId)
      const listados = new Map<string, { dbvId: string; nome: string; unidadeId: string; unidadeNome: string; datas: Date[] }>()
      for (const encontro of doGrupo) {
        const linhasDoEncontro = linhas.filter((linha) => linha.encontroId === encontro.id).map(linhaDoEncontro)
        const todos = membrosDaChamada(grupo.id, unidadesNaData(grupo.unidades, grupo.id, encontro.data), encontro.data, linhasDoEncontro, vinculos)
        for (const membro of corte ? await corte.itens(todos) : todos) {
          const chave = `${membro.unidadeId}:${membro.dbvId}`
          const listado = listados.get(chave) ?? { ...membro, datas: [] }
          listado.datas.push(encontro.data)
          listados.set(chave, listado)
        }
      }
      const unidades = new Map<string, GrupoDoPacote['unidades'][number]>()
      for (const listado of listados.values()) {
        const unidade = unidades.get(listado.unidadeId) ?? { id: listado.unidadeId, nome: listado.unidadeNome, membros: [] }
        unidades.set(listado.unidadeId, unidade)
        const reais = vinculos.filter((v) => v.dbvId === listado.dbvId && v.unidadeId === listado.unidadeId)
        const cobertas = doGrupo.filter((encontro) => reais.some((v) => cobre(v, encontro.data))).map((encontro) => encontro.data.getTime())
        const mesmaLista = cobertas.length === listado.datas.length && listado.datas.every((data) => cobertas.includes(data.getTime()))
        const intervalos = mesmaLista ? reais.map(intervaloReal) : listado.datas.map(intervaloDeUmDia)
        unidade.membros.push(...intervalos.map((intervalo) => ({ dbvId: listado.dbvId, nome: listado.nome, ...intervalo })))
      }
      resultado.push({
        id: grupo.id,
        encontroIds: doGrupo.map((encontro) => encontro.id),
        nome: grupo.nome,
        unidades: [...unidades.values()]
          .map((unidade) => ({
            ...unidade,
            membros: unidade.membros.sort((a, b) => colador.compare(a.nome, b.nome) || a.dbvId.localeCompare(b.dbvId) || a.inicio.localeCompare(b.inicio)),
          }))
          .sort((a, b) => colador.compare(a.nome, b.nome) || a.id.localeCompare(b.id)),
      })
    }
    return resultado
  }
}

function intervaloReal(v: Vinculo): { inicio: string; fim: string | null } {
  return { inicio: paraDataCivil(v.inicio), fim: v.fim ? paraDataCivil(v.fim) : null }
}

function intervaloDeUmDia(data: Date): { inicio: string; fim: string } {
  const dia = paraDataCivil(data)
  return { inicio: dia, fim: somarDias(dia, 1) }
}
