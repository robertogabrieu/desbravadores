import { Injectable } from '@nestjs/common'
import type { ClasseDetalheSaida, ClasseFiltro, ClasseRegularResumo, ClasseSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { colador } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import type { Prisma } from '../generated/prisma/client.js'
import { corTokenDaClasse } from './apresentacao-classe'
import { avancadasPareadas, temParAtivo } from './par-regular-avancada'

type Classe = z.infer<typeof ClasseSaida>
type Detalhe = z.infer<typeof ClasseDetalheSaida>
type ResumoDaRegular = z.infer<typeof ClasseRegularResumo>

const SELECAO_CLASSE = (clubeId: string) =>
  ({
    id: true,
    nome: true,
    idade: true,
    tipo: true,
    trilha: true,
    origem: true,
    classeBaseId: true,
    ordem: true,
    classeBase: { select: { nome: true } },
    clubes: { where: { clubeId } },
  }) satisfies Prisma.ClasseSelect

type ClasseLida = Prisma.ClasseGetPayload<{ select: ReturnType<typeof SELECAO_CLASSE> }>

/** Requisito oficial desativado pela carga prevalece sobre o ajuste do clube (SPEC D12). */
function estaAtivo(requisitoAtivo: boolean, ajusteAtivo: boolean | null | undefined): boolean {
  return requisitoAtivo && ajusteAtivo !== false
}

/** Quem anda com quem, pela regra central do par: a avançada de cada regular e a regular de cada avançada. */
interface Pares {
  avancadaDaRegular: Map<string, string>
  regularDaAvancada: Map<string, string>
}

function montarClasse(classe: ClasseLida, totalRequisitos: number, pares: Pares): Classe {
  const doClube = classe.clubes[0]
  return {
    id: classe.id,
    nome: classe.nome,
    idade: classe.idade,
    tipo: classe.tipo,
    trilha: classe.trilha,
    origem: classe.origem,
    classeBaseId: classe.classeBaseId,
    avancadaPareadaId: pares.avancadaDaRegular.get(classe.id) ?? null,
    regularDoParId: pares.regularDaAvancada.get(classe.id) ?? null,
    ordem: classe.ordem,
    corToken: corTokenDaClasse(classe),
    ativa: doClube?.ativa ?? true,
    quemMontaCronograma: doClube?.quemMontaCronograma ?? 'ADM',
    totalRequisitos,
  }
}

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
  ) {}

  async listar(clubeId: string, filtro: z.infer<typeof ClasseFiltro>): Promise<Classe[]> {
    const classes = await this.prisma.classe.findMany({
      where: { OR: [{ clubeId: null }, { clubeId }], ativa: true, trilha: filtro.trilha, tipo: filtro.tipo },
      select: SELECAO_CLASSE(clubeId),
      orderBy: { ordem: 'asc' },
    })
    const totais = await this.totaisDeRequisitos(clubeId, classes.map((c) => c.id))
    const pares = await this.paresDe(clubeId, classes)
    return classes.map((classe) => montarClasse(classe, totais.get(classe.id) ?? 0, pares))
  }

  /** Um só acesso ao banco para todas as classes recebidas; só entram os pares ativos. */
  private async paresDe(clubeId: string, classes: Array<{ id: string; classeBaseId: string | null }>): Promise<Pares> {
    const pareadas = await avancadasPareadas(this.prisma, clubeId, classes.flatMap((classe) => [classe.id, ...(classe.classeBaseId ? [classe.classeBaseId] : [])]))
    const avancadaDaRegular = new Map([...pareadas].map(([regularId, avancada]) => [regularId, avancada.id]))
    const regularDaAvancada = new Map([...pareadas].map(([regularId, avancada]) => [avancada.id, regularId]))
    return { avancadaDaRegular, regularDaAvancada }
  }

  async detalhar(clubeId: string, id: string): Promise<Detalhe> {
    const classe = await this.prisma.classe.findFirst({
      where: { id, OR: [{ clubeId: null }, { clubeId }] },
      select: {
        ...SELECAO_CLASSE(clubeId),
        secoes: { orderBy: { ordem: 'asc' }, include: { requisitos: { orderBy: { ordem: 'asc' } } } },
      },
    })
    if (!classe) throw new ErroApp('NAO_ENCONTRADO', 'Classe não encontrada.')
    const ajustes = await this.prisma.requisitoAjuste.findMany({
      where: { clubeId, requisito: { secao: { classeId: id } } },
    })
    const ajustePorRequisito = new Map(ajustes.map((ajuste) => [ajuste.requisitoId, ajuste]))
    const secoes = classe.secoes.map((secao) => ({
      id: secao.id,
      codigo: secao.codigo,
      nome: secao.nome,
      ordem: secao.ordem,
      requisitos: secao.requisitos.map((requisito) => {
        const ajuste = ajustePorRequisito.get(requisito.id)
        return {
          id: requisito.id,
          codigo: requisito.codigo,
          texto: requisito.texto,
          campo: ajuste?.campo ?? requisito.campo,
          ativo: estaAtivo(requisito.ativo, ajuste?.ativo),
          oficial: { ativo: requisito.ativo, campo: requisito.campo },
          ajustado: ajuste !== undefined && (ajuste.ativo !== null || ajuste.campo !== null),
        }
      }),
    }))
    const total = secoes.reduce((soma, secao) => soma + secao.requisitos.filter((r) => r.ativo).length, 0)
    const regular = classe.classeBaseId && (await temParAtivo(this.prisma, clubeId, classe.id)) ? await this.resumirRegular(clubeId, classe.classeBaseId) : null
    return { ...montarClasse(classe, total, await this.paresDe(clubeId, [classe])), regular, secoes }
  }

  private async resumirRegular(clubeId: string, regularId: string): Promise<ResumoDaRegular | null> {
    const regular = await this.prisma.classe.findFirst({
      where: { id: regularId, OR: [{ clubeId: null }, { clubeId }] },
      select: { id: true, nome: true, clubes: { where: { clubeId }, select: { quemMontaCronograma: true } } },
    })
    if (!regular) return null
    const [relogio, instrutores] = await Promise.all([
      this.escopo.relogio(clubeId),
      this.prisma.vinculo.findMany({
        where: { clubeId, papel: 'INSTRUTOR', ativo: true, classes: { some: { classeId: regularId } } },
        select: { usuario: { select: { nome: true } } },
      }),
    ])
    const totalAlunos = await this.prisma.matriculaClasse.count({
      where: { clubeId, classeId: regularId, anoClube: relogio.anoClube, status: { not: 'DESISTIU' } },
    })
    return {
      id: regular.id,
      nome: regular.nome,
      instrutores: instrutores.map((v) => v.usuario.nome).sort((a, b) => colador.compare(a, b)),
      quemMontaCronograma: regular.clubes[0]?.quemMontaCronograma ?? 'ADM',
      totalAlunos,
    }
  }

  /** Requisitos ativos por classe, com os ajustes do clube aplicados. */
  private async totaisDeRequisitos(clubeId: string, classeIds: string[]): Promise<Map<string, number>> {
    const [requisitos, ajustes] = await Promise.all([
      this.prisma.requisito.findMany({
        where: { ativo: true, secao: { classeId: { in: classeIds } } },
        select: { id: true, secao: { select: { classeId: true } } },
      }),
      this.prisma.requisitoAjuste.findMany({ where: { clubeId, ativo: false }, select: { requisitoId: true } }),
    ])
    const desligados = new Set(ajustes.map((ajuste) => ajuste.requisitoId))
    const totais = new Map<string, number>()
    for (const requisito of requisitos) {
      if (desligados.has(requisito.id)) continue
      const classeId = requisito.secao.classeId
      totais.set(classeId, (totais.get(classeId) ?? 0) + 1)
    }
    return totais
  }
}
