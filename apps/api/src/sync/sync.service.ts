import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { anoClube, hojeNoFuso, idade, type PacoteSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'

type Pacote = z.infer<typeof PacoteSaida>
type PacoteSemVersao = Omit<Pacote, 'versao' | 'geradoEm'>

const GATILHOS_DA_CHAMADA = ['PRESENCA', 'PONTUALIDADE', 'UNIFORME', 'BIBLIA', 'LICAO'] as const
const DIAS_DE_REUNIOES = 30
const DIAS_DE_ALBUNS = 60

function somarDias(data: string, dias: number): string {
  return paraDataCivil(new Date(daDataCivil(data).getTime() + dias * 86_400_000))
}

/** Ordem estavel: nome e, no empate, id. */
function porNome<T extends { nome: string; id: string }>(a: T, b: T): number {
  return a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id)
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
  ) {}

  /** Pacote do domingo (SPEC Fase 1, 4.2). So o conselheiro recebe unidades; ADM e instrutor, lista vazia. */
  async pacote(sessao: SessaoLogada, agora: Date = new Date()): Promise<Pacote> {
    const { clubeId } = sessao
    const [clube, configuracao, criterios] = await Promise.all([
      this.prisma.clube.findUniqueOrThrow({ where: { id: clubeId }, select: { id: true, nome: true } }),
      this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } }),
      this.prisma.criterioRanking.findMany({
        where: { clubeId, padrao: true, gatilho: { in: [...GATILHOS_DA_CHAMADA] } },
        select: { gatilho: true, nome: true, pontos: true, ativo: true },
      }),
    ])
    const hoje = hojeNoFuso(configuracao.fuso, agora)
    const unidadeIds = sessao.papel === 'CONSELHEIRO' ? await this.escopo.unidadesDoConselheiro(sessao) : []

    const conteudo: PacoteSemVersao = {
      usuarioId: sessao.usuarioId,
      vinculoId: sessao.vinculoId,
      clube: {
        id: clube.id,
        nome: clube.nome,
        fuso: configuracao.fuso,
        diaReuniao: configuracao.diaReuniao,
        horaReuniao: configuracao.horaReuniao,
        localReuniaoPadrao: configuracao.localReuniaoPadrao,
        descontarFalta: configuracao.descontarFalta,
        pontosDescontoFalta: configuracao.pontosDescontoFalta,
      },
      criterios: GATILHOS_DA_CHAMADA.flatMap((gatilho) => {
        const criterio = criterios.find((c) => c.gatilho === gatilho)
        return criterio ? [{ gatilho, nome: criterio.nome, pontos: criterio.pontos, ativo: criterio.ativo }] : []
      }),
      unidades: await this.unidades(clubeId, unidadeIds, hoje, anoClube(hoje, configuracao.inicioAnoClube)),
      reunioesRecentes: await this.reunioes(clubeId, unidadeIds, somarDias(hoje, -DIAS_DE_REUNIOES)),
      albunsRecentes: await this.albuns(clubeId, unidadeIds, somarDias(hoje, -DIAS_DE_ALBUNS)),
    }
    const versao = createHash('sha256').update(JSON.stringify(conteudo)).digest('hex')
    return { versao, geradoEm: agora.toISOString(), ...conteudo }
  }

  private async unidades(clubeId: string, unidadeIds: string[], hoje: string, ano: number): Promise<Pacote['unidades']> {
    if (unidadeIds.length === 0) return []
    const unidades = await this.prisma.unidade.findMany({
      where: { clubeId, id: { in: unidadeIds }, ativa: true },
      select: { id: true, nome: true },
    })
    const membros = await this.prisma.membroUnidade.findMany({
      where: { clubeId, unidadeId: { in: unidades.map((u) => u.id) }, fim: null, dbv: { clubeId, tipo: 'DBV', ativo: true } },
      select: {
        unidadeId: true,
        dbv: {
          select: {
            id: true,
            nome: true,
            nomePublico: true,
            sexo: true,
            nascimento: true,
            autorizacaoImagem: true,
            matriculas: {
              where: { clubeId, anoClube: ano, status: 'CURSANDO', classe: { tipo: 'REGULAR' } },
              orderBy: { classe: { ordem: 'asc' } },
              select: { classe: { select: SELECAO_REF_CLASSE } },
            },
          },
        },
      },
    })
    return unidades.sort(porNome).map((unidade) => ({
      id: unidade.id,
      nome: unidade.nome,
      membros: membros
        .filter((m) => m.unidadeId === unidade.id)
        .map((m) => m.dbv)
        .sort(porNome)
        .map((dbv) => {
          const classe = dbv.matriculas[0]?.classe
          return {
            dbvId: dbv.id,
            nome: dbv.nome,
            nomePublico: dbv.nomePublico,
            sexo: dbv.sexo,
            idade: idade(paraDataCivil(dbv.nascimento), hoje),
            classeAtual: classe ? refClasse(classe) : null,
            autorizacaoImagem: dbv.autorizacaoImagem,
          }
        }),
    }))
  }

  private async reunioes(clubeId: string, unidadeIds: string[], desde: string): Promise<Pacote['reunioesRecentes']> {
    if (unidadeIds.length === 0) return []
    const reunioes = await this.prisma.reuniao.findMany({
      where: { clubeId, unidadeId: { in: unidadeIds }, data: { gte: daDataCivil(desde) } },
      orderBy: [{ data: 'asc' }, { unidadeId: 'asc' }],
      include: { chamadas: { where: { clubeId }, orderBy: { dbvId: 'asc' } } },
    })
    return reunioes.map((reuniao) => ({
      id: reuniao.id,
      unidadeId: reuniao.unidadeId,
      data: paraDataCivil(reuniao.data),
      horario: reuniao.horario,
      local: reuniao.local,
      observacoes: reuniao.observacoes,
      cabecalhoVersao: reuniao.cabecalhoVersao.toISOString(),
      chamada: reuniao.chamadas.map((linha) => ({
        dbvId: linha.dbvId,
        situacao: linha.situacao,
        uniforme: linha.uniforme,
        biblia: linha.biblia,
        licao: linha.licao,
        versao: linha.versao.toISOString(),
      })),
    }))
  }

  private async albuns(clubeId: string, unidadeIds: string[], desde: string): Promise<Pacote['albunsRecentes']> {
    if (unidadeIds.length === 0) return []
    const albuns = await this.prisma.album.findMany({
      where: { clubeId, unidadeId: { in: unidadeIds }, data: { gte: daDataCivil(desde) } },
      orderBy: [{ data: 'asc' }, { id: 'asc' }],
    })
    return albuns.map((album) => ({
      id: album.id,
      unidadeId: album.unidadeId,
      titulo: album.titulo,
      data: paraDataCivil(album.data),
      reuniaoId: album.reuniaoId,
    }))
  }
}
