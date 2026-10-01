import { Injectable } from '@nestjs/common'
import { mediaTurma, percentualClasse, prontoParaInvestidura } from '@desbravadores/shared'
import type { ProgressoClasseSaida, ProgressoDbvSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { colador, daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo, type RelogioDoClube } from '../desbravadores/escopo.service'
import type { StatusMatricula } from '../generated/prisma/client.js'
import { ehFichaDaSessao } from './conclusoes'

type ProgressoClasse = z.infer<typeof ProgressoClasseSaida>
type ProgressoDbv = z.infer<typeof ProgressoDbvSaida>

/** B11: `DESISTIU` nunca entra no progresso. */
const STATUS_NO_PROGRESSO: StatusMatricula[] = ['CURSANDO', 'CONCLUIDA', 'INVESTIDA']

const CLASSE_NAO_ENCONTRADA = 'Classe não encontrada.'
const DBV_NAO_ENCONTRADO = 'Desbravador não encontrado.'

export interface SecaoDaClasse {
  codigo: string
  nome: string
  requisitos: { id: string; codigo: string; texto: string; campo: boolean }[]
}

export interface ProgressoCalculado {
  totalRequisitos: number
  limiarAlerta: number
  itens: (Omit<ProgressoClasse['itens'][number], 'voce'> & { percentualExato: number; usuarioId: string | null })[]
}

@Injectable()
export class ServicoProgresso {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
  ) {}

  /** Quem pede alcanca o desbravador (perfil, ranking e progresso usam a mesma regra); senao, 404. */
  async exigirDbvNoEscopo(
    sessao: SessaoLogada,
    relogio: RelogioDoClube,
    dbvId: string,
  ): Promise<{ id: string; tipo: 'DBV' | 'LIDER'; usuarioId: string | null }> {
    const doPapel = await this.escopo.filtroDesbravadores(sessao, relogio)
    const dbv = await this.prisma.desbravador.findFirst({
      where: { clubeId: sessao.clubeId, AND: [doPapel, { id: dbvId }] },
      select: { id: true, tipo: true, usuarioId: true },
    })
    if (!dbv) throw new ErroApp('NAO_ENCONTRADO', DBV_NAO_ENCONTRADO)
    return dbv
  }

  /** Secoes da classe com os requisitos ATIVOS para o clube: `RequisitoAjuste.ativo` vence o oficial. */
  async secoesAtivas(clubeId: string, classeId: string): Promise<SecaoDaClasse[]> {
    const secoes = await this.prisma.secaoRequisito.findMany({
      where: { classeId },
      orderBy: { ordem: 'asc' },
      select: {
        codigo: true,
        nome: true,
        requisitos: { orderBy: { ordem: 'asc' }, select: { id: true, codigo: true, texto: true, campo: true, ativo: true } },
      },
    })
    const ids = secoes.flatMap((secao) => secao.requisitos.map((requisito) => requisito.id))
    const ajustes = await this.prisma.requisitoAjuste.findMany({
      where: { clubeId, requisitoId: { in: ids } },
      select: { requisitoId: true, ativo: true, campo: true },
    })
    const ajustePorRequisito = new Map(ajustes.map((ajuste) => [ajuste.requisitoId, ajuste]))
    return secoes.map((secao) => ({
      codigo: secao.codigo,
      nome: secao.nome,
      requisitos: secao.requisitos
        .filter((requisito) => ajustePorRequisito.get(requisito.id)?.ativo ?? requisito.ativo)
        .map((requisito) => ({
          id: requisito.id,
          codigo: requisito.codigo,
          texto: requisito.texto,
          campo: ajustePorRequisito.get(requisito.id)?.campo ?? requisito.campo,
        })),
    }))
  }

  /** F7: conclusoes ativas dos requisitos ativos / total; o arredondamento so na saida. */
  async calcularClasse(clubeId: string, classeId: string, anoClube: number): Promise<ProgressoCalculado> {
    const requisitoIds = (await this.secoesAtivas(clubeId, classeId)).flatMap((secao) => secao.requisitos.map((requisito) => requisito.id))
    const total = requisitoIds.length
    const matriculas = await this.prisma.matriculaClasse.findMany({
      where: { clubeId, classeId, anoClube, status: { in: STATUS_NO_PROGRESSO }, dbv: { ativo: true } },
      select: { status: true, dbv: { select: { id: true, nome: true, tipo: true, usuarioId: true } } },
    })
    const concluidas = await this.prisma.requisitoConcluido.findMany({
      where: { clubeId, dbvId: { in: matriculas.map((matricula) => matricula.dbv.id) }, requisitoId: { in: requisitoIds }, removidoEm: null },
      select: { dbvId: true },
    })
    const concluidosPorDbv = new Map<string, number>()
    for (const { dbvId } of concluidas) concluidosPorDbv.set(dbvId, (concluidosPorDbv.get(dbvId) ?? 0) + 1)

    const configuracao = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } })
    const itens = matriculas
      .map((matricula) => {
        const concluidos = concluidosPorDbv.get(matricula.dbv.id) ?? 0
        const percentualExato = percentualClasse(concluidos, total)
        return {
          dbvId: matricula.dbv.id,
          nome: matricula.dbv.nome,
          tipo: matricula.dbv.tipo,
          status: matricula.status,
          concluidos,
          percentual: Math.round(percentualExato),
          faltam: total - concluidos,
          percentualExato,
          usuarioId: matricula.dbv.usuarioId,
        }
      })
      .sort((a, b) => b.percentual - a.percentual || colador.compare(a.nome, b.nome))
    return { totalRequisitos: total, limiarAlerta: configuracao.limiarProgressoAlerta, itens }
  }

  async progressoDaClasse(sessao: SessaoLogada, classeId: string, anoClube?: number): Promise<ProgressoClasse> {
    const { clubeId } = sessao
    if (sessao.papel === 'INSTRUTOR' && !(await this.escopo.classesDoInstrutor(sessao)).includes(classeId)) {
      throw new ErroApp('NAO_ENCONTRADO', CLASSE_NAO_ENCONTRADA)
    }
    const classe = await this.prisma.classe.findFirst({
      where: { id: classeId, OR: [{ clubeId: null }, { clubeId }] },
      select: SELECAO_REF_CLASSE,
    })
    if (!classe) throw new ErroApp('NAO_ENCONTRADO', CLASSE_NAO_ENCONTRADA)

    const ano = anoClube ?? (await this.escopo.relogio(clubeId)).anoClube
    const calculado = await this.calcularClasse(clubeId, classeId, ano)
    const regular = classe.tipo === 'REGULAR'
    const cursando = calculado.itens.filter((item) => item.status === 'CURSANDO')
    return {
      classe: refClasse(classe),
      anoClube: ano,
      totalRequisitos: calculado.totalRequisitos,
      media: calculado.itens.length === 0 ? null : mediaTurma(calculado.itens.map((item) => item.percentualExato)),
      prontos: regular ? cursando.filter((item) => prontoParaInvestidura(item.percentualExato)).length : 0,
      concluiramAvancada: regular ? 0 : calculado.itens.filter((item) => item.percentualExato === 100).length,
      abaixoDoLimiar: cursando.filter((item) => item.percentualExato < calculado.limiarAlerta).length,
      itens: calculado.itens.map((item) => ({
        dbvId: item.dbvId,
        nome: item.nome,
        tipo: item.tipo,
        status: item.status,
        concluidos: item.concluidos,
        percentual: item.percentual,
        faltam: item.faltam,
        voce: ehFichaDaSessao(sessao, item.usuarioId),
      })),
    }
  }

  async progressoDoDbv(sessao: SessaoLogada, dbvId: string): Promise<ProgressoDbv> {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const dbv = await this.exigirDbvNoEscopo(sessao, relogio, dbvId)

    const matriculas = await this.prisma.matriculaClasse.findMany({
      where: { clubeId, dbvId, anoClube: relogio.anoClube, status: { in: STATUS_NO_PROGRESSO } },
      select: { status: true, classe: { select: { ...SELECAO_REF_CLASSE, ordem: true } } },
    })
    const ordemDaTrilha = (item: (typeof matriculas)[number]): number =>
      (item.classe.trilha === 'INDIVIDUAL' ? 0 : 2) + (item.classe.tipo === 'REGULAR' ? 0 : 1)
    matriculas.sort((a, b) => ordemDaTrilha(a) - ordemDaTrilha(b) || a.classe.ordem - b.classe.ordem)

    const conclusoes = await this.prisma.requisitoConcluido.findMany({
      where: { clubeId, dbvId, removidoEm: null },
      select: { requisitoId: true, concluidoEm: true, marcadoPor: { select: { nome: true } } },
    })
    const conclusaoPorRequisito = new Map(conclusoes.map((conclusao) => [conclusao.requisitoId, conclusao]))
    const permissoes = await this.escopo.permissoes(sessao)
    const classesDoInstrutor = sessao.papel === 'INSTRUTOR' ? await this.escopo.classesDoInstrutor(sessao) : []
    const temPermissao = permissoes.includes('requisito.marcar') && !ehFichaDaSessao(sessao, dbv.usuarioId)

    const saida: ProgressoDbv['matriculas'] = []
    for (const matricula of matriculas) {
      const podeMarcar =
        temPermissao && (sessao.papel === 'ADM' || (sessao.papel === 'INSTRUTOR' && classesDoInstrutor.includes(matricula.classe.id)))
      const secoes = (await this.secoesAtivas(clubeId, matricula.classe.id)).map((secao) => {
        const requisitos = secao.requisitos.map((requisito) => {
          const conclusao = conclusaoPorRequisito.get(requisito.id)
          return {
            ...requisito,
            secaoCodigo: secao.codigo,
            concluidoEm: conclusao ? paraDataCivil(conclusao.concluidoEm) : null,
            marcadoPor: conclusao?.marcadoPor.nome ?? null,
            podeMarcar,
          }
        })
        return {
          codigo: secao.codigo,
          nome: secao.nome,
          concluidos: requisitos.filter((requisito) => requisito.concluidoEm !== null).length,
          total: requisitos.length,
          requisitos,
        }
      })
      const total = secoes.reduce((soma, secao) => soma + secao.total, 0)
      const concluidos = secoes.reduce((soma, secao) => soma + secao.concluidos, 0)
      saida.push({
        classe: refClasse(matricula.classe),
        anoClube: relogio.anoClube,
        status: matricula.status,
        percentual: Math.round(percentualClasse(concluidos, total)),
        concluidos,
        total,
        secoes,
      })
    }
    return { matriculas: saida }
  }

  /** Inicio e fim (exclusivo) do ano do clube, como datas de coluna `@db.Date`. */
  intervaloDoAno(relogio: RelogioDoClube): { de: Date; ate: Date } {
    return {
      de: daDataCivil(`${relogio.anoClube}-${relogio.inicioAnoClube}`),
      ate: daDataCivil(`${relogio.anoClube + 1}-${relogio.inicioAnoClube}`),
    }
  }
}
