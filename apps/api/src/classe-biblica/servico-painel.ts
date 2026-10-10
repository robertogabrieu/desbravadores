import { Injectable } from '@nestjs/common'
import type { EdicoesSaida, EncontroDoPainel, FrequenciaGrupoSaida, PainelSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { ServicoArquivos } from '../arquivos/servico-arquivos'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { PrismaService } from '../comum/prisma/prisma.service'
import { colador, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import { unidadesNaData, type PeriodoNoGrupo } from './composicao'
import { ServicoEscopoGrupos, type AcessoAoPainel, type ItemDoEscopo } from './escopo-grupos'
import { encontrosFeitos } from './frequencia'
import { materialDoGrupo, saidaDaEdicao, SELECAO_GRUPO, situacaoDaEdicao } from './servico-edicoes'

type Encontro = z.infer<typeof EncontroDoPainel>
type Mudanca = z.infer<typeof PainelSaida>['grupos'][number]['mudancas'][number]

interface Linha {
  encontroId: string
  grupoId: string
  dbvId: string
  unidadeId: string
  presente: boolean
  participou: boolean
}

interface Periodo extends PeriodoNoGrupo {
  unidadeNome: string
  grupoNome: string
}

function porcentagem(parte: number, total: number): number | null {
  return total === 0 ? null : Math.round((100 * parte) / total)
}

/** Corta as linhas pelo escopo, pela unidade gravada nelas (D33); `null` no acesso = vê todas. */
function noEscopo<T extends ItemDoEscopo>(acesso: AcessoAoPainel, linhas: T[]): Promise<T[]> {
  return acesso.corte ? acesso.corte.itens(linhas) : Promise.resolve(linhas)
}

/**
 * Trocas de unidade do grupo depois do início da edição (D31), data ↓. Fechar um período é SAIU, para o grupo
 * aberto no mesmo dia; abrir depois do início é ENTROU, vindo do grupo fechado no mesmo dia.
 */
function mudancasDoGrupo(periodos: Periodo[], grupoId: string, inicioDaEdicao: Date): Mudanca[] {
  const outro = (unidadeId: string, campo: 'inicio' | 'fim', data: Date): string | null =>
    periodos.find((p) => p.grupoId !== grupoId && p.unidadeId === unidadeId && p[campo]?.getTime() === data.getTime())?.grupoNome ?? null
  const mudancas: Mudanca[] = []
  for (const periodo of periodos.filter((p) => p.grupoId === grupoId)) {
    if (periodo.inicio > inicioDaEdicao) {
      mudancas.push({ data: paraDataCivil(periodo.inicio), unidade: periodo.unidadeNome, tipo: 'ENTROU', outroGrupo: outro(periodo.unidadeId, 'fim', periodo.inicio) })
    }
    if (periodo.fim) {
      mudancas.push({ data: paraDataCivil(periodo.fim), unidade: periodo.unidadeNome, tipo: 'SAIU', outroGrupo: outro(periodo.unidadeId, 'inicio', periodo.fim) })
    }
  }
  return mudancas.sort((a, b) => b.data.localeCompare(a.data) || colador.compare(a.unidade, b.unidade))
}

/** Lista de edições, painel e frequência (regras 2, 9 e 13). */
@Injectable()
export class ServicoPainel {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly escopoGrupos: ServicoEscopoGrupos,
    private readonly arquivos: ServicoArquivos,
  ) {}

  async lista(sessao: SessaoLogada): Promise<z.infer<typeof EdicoesSaida>> {
    const { clubeId } = sessao
    const [{ hoje }, configuracao, unidades, edicoes] = await Promise.all([
      this.escopo.relogio(clubeId),
      this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } }),
      this.prisma.unidade.count({ where: { clubeId, ativa: true } }),
      this.prisma.edicaoClasseBiblica.findMany({
        where: { clubeId },
        include: {
          encontros: {
            where: { clubeId, canceladoEm: null },
            select: { id: true, data: true, horario: true, _count: { select: { chamadas: { where: { clubeId } } } } },
            orderBy: [{ data: 'asc' }, { id: 'asc' }],
          },
        },
      }),
    ])
    const presencas = await this.prisma.presencaClasseBiblica.groupBy({
      by: ['encontroId', 'presente'],
      where: { clubeId, encontro: { clubeId, canceladoEm: null } },
      _count: { _all: true },
    })
    const porEncontro = new Map<string, { presentes: number; total: number }>()
    for (const grupo of presencas) {
      const atual = porEncontro.get(grupo.encontroId) ?? { presentes: 0, total: 0 }
      atual.total += grupo._count._all
      if (grupo.presente) atual.presentes += grupo._count._all
      porEncontro.set(grupo.encontroId, atual)
    }

    const naoTerminadas = edicoes.filter((e) => !e.terminadaEm).sort((a, b) => b.atualizadaEm.getTime() - a.atualizadaEm.getTime())
    const terminadas = edicoes
      .filter((e) => e.terminadaEm)
      .sort((a, b) => (b.inicio?.getTime() ?? 0) - (a.inicio?.getTime() ?? 0) || colador.compare(b.id, a.id))
    return {
      edicoes: [...naoTerminadas, ...terminadas].map((edicao) => {
        const somas = edicao.encontros.reduce(
          (soma, encontro) => {
            const contagem = porEncontro.get(encontro.id)
            return { presentes: soma.presentes + (contagem?.presentes ?? 0), total: soma.total + (contagem?.total ?? 0) }
          },
          { presentes: 0, total: 0 },
        )
        const proximo = edicao.encontros.find((encontro) => paraDataCivil(encontro.data) >= hoje)
        return {
          id: edicao.id,
          nome: edicao.nome,
          situacao: situacaoDaEdicao(edicao, hoje),
          etapa: edicao.etapa,
          inicio: edicao.inicio ? paraDataCivil(edicao.inicio) : null,
          fim: edicao.fim ? paraDataCivil(edicao.fim) : null,
          encontros: edicao.encontros.length,
          encontrosFeitos: edicao.encontros.filter((encontro) => encontro._count.chamadas > 0).length,
          presencaMedia: porcentagem(somas.presentes, somas.total),
          proximoEncontro: proximo ? { data: paraDataCivil(proximo.data), horario: proximo.horario } : null,
          atualizadaEm: edicao.atualizadaEm.toISOString(),
        }
      }),
      unidades,
      padroes: { diaSemana: configuracao.diaReuniao, local: configuracao.localReuniaoPadrao },
    }
  }

  /** Painel; serve também às etapas do rascunho. Quem só tem a chamada vê só os grupos e os desbravadores do escopo. */
  async painel(sessao: SessaoLogada, edicaoId: string): Promise<z.infer<typeof PainelSaida>> {
    const { clubeId } = sessao
    const acesso = await this.escopoGrupos.exigirAcesso(sessao, edicaoId)
    const [{ hoje }, edicao, grupos, encontros, todasAsLinhas, todosOsPeriodos] = await Promise.all([
      this.escopo.relogio(clubeId),
      this.prisma.edicaoClasseBiblica.findFirstOrThrow({ where: { clubeId, id: edicaoId } }),
      this.prisma.grupoClasseBiblica.findMany({
        where: { clubeId, id: { in: acesso.grupoIds } },
        select: {
          ...SELECAO_GRUPO,
          unidades: {
            where: { clubeId, fim: null },
            select: {
              unidade: {
                select: {
                  id: true,
                  nome: true,
                  _count: { select: { membros: { where: { clubeId, fim: null, dbv: { clubeId, ativo: true, tipo: 'DBV' } } } } },
                },
              },
            },
          },
        },
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.encontroClasseBiblica.findMany({
        where: { clubeId, edicaoId },
        select: {
          id: true,
          data: true,
          horario: true,
          local: true,
          dataOriginal: true,
          canceladoEm: true,
          motivoCancelamento: true,
          chamadas: { where: { clubeId }, select: { grupoId: true } },
        },
        orderBy: [{ data: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.presencaClasseBiblica.findMany({
        where: { clubeId, grupoId: { in: acesso.grupoIds }, encontro: { clubeId, edicaoId } },
        select: { encontroId: true, grupoId: true, dbvId: true, unidadeId: true, presente: true, participou: true },
      }),
      this.prisma.grupoUnidadeClasseBiblica.findMany({
        where: { clubeId, edicaoId, grupo: { clubeId, removidoEm: null } },
        select: { grupoId: true, unidadeId: true, inicio: true, fim: true, unidade: { select: { nome: true } }, grupo: { select: { nome: true } } },
      }),
    ])
    const linhas: Linha[] = await noEscopo(acesso, todasAsLinhas)
    const unidadesVisiveis = acesso.corte ? await acesso.corte.unidades([...new Set(todosOsPeriodos.map((p) => p.unidadeId))]) : null
    const periodos: Periodo[] = todosOsPeriodos
      .filter((p) => unidadesVisiveis === null || unidadesVisiveis.has(p.unidadeId))
      .map((p) => ({ grupoId: p.grupoId, unidadeId: p.unidadeId, inicio: p.inicio, fim: p.fim, unidadeNome: p.unidade.nome, grupoNome: p.grupo.nome }))
    const nomeDaUnidade = new Map(periodos.map((p) => [p.unidadeId, p.unidadeNome]))
    const cancelados = new Set(encontros.filter((e) => e.canceladoEm).map((e) => e.id))

    const saidaDoGrupo = async (grupo: (typeof grupos)[number]) => {
      const temChamadaDoGrupo = (encontro: (typeof encontros)[number]): boolean => encontro.chamadas.some((c) => c.grupoId === grupo.id)
      const doGrupo = linhas.filter((linha) => linha.grupoId === grupo.id)
      const valendo = doGrupo.filter((linha) => !cancelados.has(linha.encontroId))
      const porDbv = new Map<string, { y: number; x: number }>()
      for (const linha of valendo) {
        const atual = porDbv.get(linha.dbvId) ?? { y: 0, x: 0 }
        atual.y += 1
        if (linha.presente) atual.x += 1
        porDbv.set(linha.dbvId, atual)
      }
      const porVir = encontros.filter((e) => !e.canceladoEm && paraDataCivil(e.data) >= hoje && !temChamadaDoGrupo(e))
      const encontroDoPainel = (encontro: (typeof encontros)[number]): Encontro => {
        const daChamada = doGrupo.filter((linha) => linha.encontroId === encontro.id)
        return {
          id: encontro.id,
          data: paraDataCivil(encontro.data),
          horario: encontro.horario,
          local: encontro.local,
          dataOriginal: encontro.dataOriginal ? paraDataCivil(encontro.dataOriginal) : null,
          cancelado: encontro.canceladoEm !== null,
          motivo: encontro.motivoCancelamento,
          temChamada: encontro.chamadas.length > 0,
          unidades: [...unidadesNaData(periodos, grupo.id, encontro.data)].map((id) => nomeDaUnidade.get(id) ?? '').sort((a, b) => colador.compare(a, b)),
          chamada: temChamadaDoGrupo(encontro)
            ? {
                presentes: daChamada.filter((linha) => linha.presente).length,
                total: daChamada.length,
                participaram: daChamada.filter((linha) => linha.participou).length,
              }
            : null,
        }
      }
      const proximo = porVir[0]
      return {
        id: grupo.id,
        nome: grupo.nome,
        unidades: grupo.unidades
          .map(({ unidade }) => ({ id: unidade.id, nome: unidade.nome, dbvs: unidade._count.membros }))
          .sort((a, b) => colador.compare(a.nome, b.nome)),
        material: materialDoGrupo(this.arquivos, clubeId, grupo),
        proximoEncontro: proximo ? encontroDoPainel(proximo) : null,
        frequenciaMedia: porcentagem(valendo.filter((linha) => linha.presente).length, valendo.length),
        encontrosFeitos: await encontrosFeitos(this.prisma, clubeId, edicaoId, grupo.id),
        encontrosPorVir: porVir.length,
        abaixoDaMetade: [...porDbv.values()].filter(({ x, y }) => x * 2 < y).length,
        encontros: encontros
          .filter((e) => e.canceladoEm || e.dataOriginal || temChamadaDoGrupo(e) || paraDataCivil(e.data) < hoje)
          .reverse()
          .map(encontroDoPainel),
        mudancas: edicao.terminadaEm && edicao.inicio ? mudancasDoGrupo(periodos, grupo.id, edicao.inicio) : [],
      }
    }

    return {
      edicao: saidaDaEdicao(edicao, hoje),
      grupos: await Promise.all(grupos.map(saidaDoGrupo)),
      podeGerenciar: acesso.podeGerenciar,
      podeFazerChamada: acesso.podeFazerChamada,
    }
  }

  /** X de Y de cada desbravador nas linhas do grupo (regra 13), da menor presença para a maior; cortada pelo escopo. */
  async frequencia(sessao: SessaoLogada, grupoId: string): Promise<z.infer<typeof FrequenciaGrupoSaida>> {
    const { clubeId } = sessao
    const { grupo, acesso } = await this.escopoGrupos.exigirGrupo(sessao, grupoId)
    const todas = await this.prisma.presencaClasseBiblica.findMany({
      where: { clubeId, grupoId, encontro: { clubeId, canceladoEm: null, chamadas: { some: { clubeId, grupoId } } } },
      select: {
        dbvId: true,
        unidadeId: true,
        presente: true,
        participou: true,
        dbv: { select: { nome: true } },
        unidade: { select: { nome: true } },
      },
      orderBy: [{ encontro: { data: 'asc' } }],
    })
    const linhas = await noEscopo(acesso, todas)
    const porDbv = new Map<string, z.infer<typeof FrequenciaGrupoSaida>['itens'][number]>()
    for (const linha of linhas) {
      const atual = porDbv.get(linha.dbvId) ?? {
        dbvId: linha.dbvId, nome: linha.dbv.nome, unidade: linha.unidade.nome, encontros: 0, presencas: 0, participacoes: 0,
      }
      atual.encontros += 1
      if (linha.presente) atual.presencas += 1
      if (linha.participou) atual.participacoes += 1
      atual.unidade = linha.unidade.nome
      porDbv.set(linha.dbvId, atual)
    }
    const itens = [...porDbv.values()].sort(
      (a, b) => a.presencas / a.encontros - b.presencas / b.encontros || colador.compare(a.nome, b.nome),
    )
    return { grupo: { id: grupo.id, nome: grupo.nome }, itens }
  }
}
