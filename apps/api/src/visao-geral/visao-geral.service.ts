import { Injectable } from '@nestjs/common'
import {
  anoClube,
  frequencia,
  hojeNoFuso,
  mediaTurma,
  percentualClasse,
  type SituacaoChamada,
  type VisaoGeralSaida,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoCronograma } from '../cronogramas/servico-cronograma'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'

type Visao = z.infer<typeof VisaoGeralSaida>

const TIPOS_DO_FEED = ['AULA_REGISTRADA', 'CRONOGRAMA_ENVIADO', 'CRONOGRAMA_PUBLICADO', 'EVENTO_CRIADO']

interface Periodos {
  hoje: string
  ha3Meses: string
  inicioDoMes: string
  inicioDoMesAnterior: string
  fimDoMesAnterior: string
  inicioDoAnoClube: string
  fimDoAnoClube: string
  anoClube: number
}

interface LinhaDeChamada {
  unidadeId: string
  data: string
  situacao: SituacaoChamada
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0')
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/** Mesmo dia `meses` atras; se o mes de la for mais curto, o ultimo dia dele. */
function mesesAtras(data: string, meses: number): string {
  const [ano, mes, dia] = data.split('-').map(Number) as [number, number, number]
  const alvo = new Date(Date.UTC(ano, mes - 1 - meses, 1))
  const anoAlvo = alvo.getUTCFullYear()
  const mesAlvo = alvo.getUTCMonth() + 1
  return `${anoAlvo}-${doisDigitos(mesAlvo)}-${doisDigitos(Math.min(dia, ultimoDiaDoMes(anoAlvo, mesAlvo)))}`
}

function calcularPeriodos(hoje: string, inicioAnoClube: string): Periodos {
  const ano = anoClube(hoje, inicioAnoClube)
  const inicioDoMes = `${hoje.slice(0, 7)}-01`
  const inicioDoMesAnterior = `${mesesAtras(inicioDoMes, 1).slice(0, 7)}-01`
  const fimDoMesAnterior = new Date(daDataCivil(inicioDoMes).getTime() - 86_400_000).toISOString().slice(0, 10)
  return {
    hoje,
    ha3Meses: mesesAtras(hoje, 3),
    inicioDoMes,
    inicioDoMesAnterior,
    fimDoMesAnterior,
    inicioDoAnoClube: `${ano}-${inicioAnoClube}`,
    fimDoAnoClube: `${ano + 1}-${inicioAnoClube}`,
    anoClube: ano,
  }
}

/** E13: frequencia arredondada sobre as linhas; sem linha, `null`. */
function frequenciaDasLinhas(linhas: LinhaDeChamada[]): number | null {
  const valor = frequencia(linhas.map((linha) => linha.situacao))
  return valor === null ? null : Math.round(valor)
}

@Injectable()
export class VisaoGeralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cronogramas: ServicoCronograma,
  ) {}

  async obter(clubeId: string): Promise<Visao> {
    const configuracao = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } })
    const periodos = calcularPeriodos(hojeNoFuso(configuracao.fuso, new Date()), configuracao.inicioAnoClube)

    const [numeros, chamadas, classes, unidades, cronogramasEnviados, atividades] = await Promise.all([
      this.numerosDoClube(clubeId, periodos),
      this.chamadasDosDoisMeses(clubeId, periodos),
      this.progressoDasClasses(clubeId, periodos.anoClube),
      this.resumoDasUnidades(clubeId),
      this.cronogramasAguardando(clubeId),
      this.atividadeRecente(clubeId),
    ])

    const doMes = chamadas.filter((linha) => linha.data >= periodos.inicioDoMes)
    const frequenciaMes = frequenciaDasLinhas(doMes)
    const frequenciaAnterior = frequenciaDasLinhas(chamadas.filter((linha) => linha.data < periodos.inicioDoMes))
    const { dbvsAtivos, dbvsHa3Meses, especialidadesAno, instrutores } = numeros

    return {
      dbvsAtivos,
      variacaoTrimestre: dbvsAtivos - dbvsHa3Meses,
      unidades: unidades.length,
      instrutores,
      classesCobertas: classes.filter((classe) => classe.instrutores.length > 0).length,
      frequenciaMes,
      variacaoFrequencia: frequenciaMes !== null && frequenciaAnterior !== null ? frequenciaMes - frequenciaAnterior : null,
      especialidadesAno,
      especialidadesPorDbv: dbvsAtivos === 0 ? 0 : Math.round((especialidadesAno / dbvsAtivos) * 10) / 10,
      progressoClasses: classes,
      unidadesResumo: unidades.map((unidade) => ({
        ...unidade,
        frequenciaMes: frequenciaDasLinhas(doMes.filter((linha) => linha.unidadeId === unidade.id)),
      })),
      cronogramasEnviados,
      atividades,
    }
  }

  private async numerosDoClube(clubeId: string, periodos: Periodos) {
    const ha3Meses = daDataCivil(periodos.ha3Meses)
    const [dbvsAtivos, dbvsHa3Meses, especialidadesAno, instrutores] = await Promise.all([
      this.prisma.desbravador.count({ where: { clubeId, tipo: 'DBV', ativo: true } }),
      this.prisma.desbravador.count({
        where: { clubeId, tipo: 'DBV', entradaEm: { lte: ha3Meses }, OR: [{ saidaEm: null }, { saidaEm: { gt: ha3Meses } }] },
      }),
      this.prisma.especialidadeConcluida.count({
        where: {
          clubeId,
          removidoEm: null,
          concluidaEm: { gte: daDataCivil(periodos.inicioDoAnoClube), lt: daDataCivil(periodos.fimDoAnoClube) },
        },
      }),
      this.prisma.vinculo.count({ where: { clubeId, papel: 'INSTRUTOR', ativo: true } }),
    ])
    return { dbvsAtivos, dbvsHa3Meses, especialidadesAno, instrutores }
  }

  /** Linhas de chamada do mes anterior inteiro e do mes corrente ate hoje. */
  private async chamadasDosDoisMeses(clubeId: string, periodos: Periodos): Promise<LinhaDeChamada[]> {
    const linhas = await this.prisma.chamada.findMany({
      where: {
        clubeId,
        reuniao: { data: { gte: daDataCivil(periodos.inicioDoMesAnterior), lte: daDataCivil(periodos.hoje) } },
      },
      select: { situacao: true, reuniao: { select: { unidadeId: true, data: true } } },
    })
    return linhas.map((linha) => ({
      unidadeId: linha.reuniao.unidadeId,
      data: paraDataCivil(linha.reuniao.data),
      situacao: linha.situacao,
    }))
  }

  /** Classes ativas do clube: media do progresso de quem cursa no ano, total de DBVs e instrutores. */
  private async progressoDasClasses(clubeId: string, ano: number): Promise<Visao['progressoClasses']> {
    const todas = await this.prisma.classe.findMany({
      where: { OR: [{ clubeId: null }, { clubeId }], ativa: true },
      select: { ...SELECAO_REF_CLASSE, ordem: true, clubes: { where: { clubeId }, select: { ativa: true } } },
      orderBy: { ordem: 'asc' },
    })
    const ativas = todas.filter((classe) => classe.clubes[0]?.ativa ?? true)
    const classeIds = ativas.map((classe) => classe.id)

    const [instrutoresPorClasse, matriculas, requisitos, ajustes] = await Promise.all([
      Promise.all(classeIds.map((classeId) => this.cronogramas.instrutoresDaClasse(clubeId, classeId))),
      this.prisma.matriculaClasse.findMany({
        where: { clubeId, anoClube: ano, status: 'CURSANDO', classeId: { in: classeIds }, dbv: { tipo: 'DBV', ativo: true } },
        select: { dbvId: true, classeId: true },
      }),
      this.prisma.requisito.findMany({
        where: { secao: { classeId: { in: classeIds } } },
        select: { id: true, ativo: true, secao: { select: { classeId: true } } },
      }),
      this.prisma.requisitoAjuste.findMany({ where: { clubeId, ativo: false }, select: { requisitoId: true, ativo: true } }),
    ])

    // Mesma regra de GET /classes/:id: conta se ativo no oficial e o clube não desligou (ajuste null ou ausente usa o oficial).
    const desligadoNoClube = new Set(ajustes.filter((ajuste) => ajuste.ativo === false).map((ajuste) => ajuste.requisitoId))
    const classeDoRequisito = new Map<string, string>()
    const totalPorClasse = new Map<string, number>()
    for (const requisito of requisitos) {
      if (!requisito.ativo || desligadoNoClube.has(requisito.id)) continue
      const classeId = requisito.secao.classeId
      classeDoRequisito.set(requisito.id, classeId)
      totalPorClasse.set(classeId, (totalPorClasse.get(classeId) ?? 0) + 1)
    }

    const concluidos = await this.prisma.requisitoConcluido.findMany({
      where: { clubeId, removidoEm: null, dbvId: { in: matriculas.map((m) => m.dbvId) }, requisitoId: { in: [...classeDoRequisito.keys()] } },
      select: { dbvId: true, requisitoId: true },
    })
    const concluidosPorDbvEClasse = new Map<string, number>()
    for (const concluido of concluidos) {
      const chave = `${concluido.dbvId}:${classeDoRequisito.get(concluido.requisitoId)}`
      concluidosPorDbvEClasse.set(chave, (concluidosPorDbvEClasse.get(chave) ?? 0) + 1)
    }

    return ativas.map((classe, indice) => {
      const dbvs = matriculas.filter((matricula) => matricula.classeId === classe.id)
      const percentuais = dbvs.map((matricula) =>
        percentualClasse(concluidosPorDbvEClasse.get(`${matricula.dbvId}:${classe.id}`) ?? 0, totalPorClasse.get(classe.id) ?? 0),
      )
      return {
        classe: refClasse(classe),
        media: dbvs.length === 0 ? null : mediaTurma(percentuais),
        totalDbvs: dbvs.length,
        instrutores: (instrutoresPorClasse[indice] ?? []).map((instrutor) => instrutor.nome),
      }
    })
  }

  /** Unidades ativas por nome, com conselheiros e DBVs ativos que estao nelas hoje. */
  private async resumoDasUnidades(clubeId: string): Promise<Omit<Visao['unidadesResumo'][number], 'frequenciaMes'>[]> {
    const unidades = await this.prisma.unidade.findMany({ where: { clubeId, ativa: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } })
    const unidadeIds = unidades.map((unidade) => unidade.id)
    const [membros, conselheiros] = await Promise.all([
      this.prisma.membroUnidade.findMany({
        where: { clubeId, unidadeId: { in: unidadeIds }, fim: null, dbv: { tipo: 'DBV', ativo: true } },
        select: { unidadeId: true },
      }),
      this.prisma.vinculoUnidade.findMany({
        where: { clubeId, unidadeId: { in: unidadeIds }, vinculo: { papel: 'CONSELHEIRO', ativo: true } },
        select: { unidadeId: true, vinculo: { select: { usuario: { select: { nome: true } } } } },
      }),
    ])
    return unidades.map((unidade) => ({
      id: unidade.id,
      nome: unidade.nome,
      conselheiros: conselheiros.filter((c) => c.unidadeId === unidade.id).map((c) => c.vinculo.usuario.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      totalDbvs: membros.filter((membro) => membro.unidadeId === unidade.id).length,
    }))
  }

  private async cronogramasAguardando(clubeId: string): Promise<Visao['cronogramasEnviados']> {
    const enviados = await this.prisma.cronograma.findMany({
      where: { clubeId, status: 'ENVIADO' },
      select: { id: true, enviadoEm: true, atualizadoEm: true, classe: { select: SELECAO_REF_CLASSE }, enviadoPor: { select: { nome: true } } },
      orderBy: [{ enviadoEm: 'asc' }, { id: 'asc' }],
    })
    return enviados.map((cronograma) => ({
      cronogramaId: cronograma.id,
      classe: refClasse(cronograma.classe),
      enviadoPor: cronograma.enviadoPor?.nome ?? '',
      enviadoEm: (cronograma.enviadoEm ?? cronograma.atualizadoEm).toISOString(),
    }))
  }

  private async atividadeRecente(clubeId: string): Promise<Visao['atividades']> {
    const atividades = await this.prisma.atividade.findMany({
      where: { clubeId, tipo: { in: TIPOS_DO_FEED } },
      select: { id: true, descricao: true, link: true, criadaEm: true, autor: { select: { nome: true } } },
      orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }],
      take: 10,
    })
    return atividades.map((atividade) => ({
      id: atividade.id,
      descricao: atividade.descricao,
      link: atividade.link,
      criadaEm: atividade.criadaEm.toISOString(),
      autor: atividade.autor?.nome ?? null,
    }))
  }
}
