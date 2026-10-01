import { Injectable } from '@nestjs/common'
import { anoClube, idade, type PacoteSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { resumosDeRequisitos } from '../aulas/apoio'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoCronograma } from '../cronogramas/servico-cronograma'
import { colador, daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import { ehFichaDaSessao } from '../progresso/conclusoes'
import type { ConfiguracaoClube } from '../generated/prisma/client.js'

type PacoteInstrutor = NonNullable<z.infer<typeof PacoteSaida>['instrutor']>
type ClasseDoPacote = PacoteInstrutor['classes'][number]

const DIAS_DE_AULAS_PROXIMAS = 14
const DIAS_DE_REGISTROS = 30

function somarDias(data: string, dias: number): string {
  return paraDataCivil(new Date(daDataCivil(data).getTime() + dias * 86_400_000))
}

/** F11: o que o instrutor precisa para registrar aula sem internet. Ordem estavel para a `versao` do pacote. */
@Injectable()
export class PacoteInstrutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly cronogramas: ServicoCronograma,
  ) {}

  async montar(sessao: SessaoLogada, configuracao: ConfiguracaoClube, hoje: string): Promise<PacoteInstrutor> {
    const { clubeId } = sessao
    const ano = anoClube(hoje, configuracao.inicioAnoClube)
    const classeIds = await this.escopo.classesDoInstrutor(sessao)
    const classes = await this.prisma.classe.findMany({
      where: { id: { in: classeIds }, OR: [{ clubeId: null }, { clubeId }] },
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      select: SELECAO_REF_CLASSE,
    })
    const criterio = await this.prisma.criterioRanking.findFirst({
      where: { clubeId, gatilho: 'REQUISITO', padrao: true },
      select: { pontos: true, ativo: true },
    })

    const doPacote: ClasseDoPacote[] = []
    for (const classe of classes) doPacote.push(await this.classe(sessao, classe, ano, hoje))
    return { classes: doPacote, pontosRequisito: criterio ?? { pontos: 0, ativo: false } }
  }

  private async classe(
    sessao: SessaoLogada,
    classe: Parameters<typeof refClasse>[0],
    ano: number,
    hoje: string,
  ): Promise<ClasseDoPacote> {
    const { clubeId } = sessao
    const requisitos = await resumosDeRequisitos(this.prisma, clubeId, { secao: { classeId: classe.id } }, true)
    return {
      classe: refClasse(classe),
      membros: await this.membros(sessao, classe.id, ano, hoje),
      requisitos,
      aulasProximas: await this.aulasProximas(clubeId, classe.id, ano, hoje),
      registrosRecentes: await this.registrosRecentes(clubeId, classe.id, somarDias(hoje, -DIAS_DE_REGISTROS)),
    }
  }

  private async membros(sessao: SessaoLogada, classeId: string, ano: number, hoje: string): Promise<ClasseDoPacote['membros']> {
    const { clubeId } = sessao
    const matriculas = await this.prisma.matriculaClasse.findMany({
      where: { clubeId, classeId, anoClube: ano, status: 'CURSANDO', dbv: { clubeId, ativo: true, tipo: { in: ['DBV', 'DIRETORIA', 'LIDER'] } } },
      select: {
        dbv: {
          select: {
            id: true,
            nome: true,
            nomePublico: true,
            tipo: true,
            usuarioId: true,
            sexo: true,
            nascimento: true,
            autorizacaoImagem: true,
            matriculas: {
              where: { clubeId, anoClube: ano, status: 'CURSANDO', classe: { tipo: 'REGULAR' } },
              orderBy: { classe: { ordem: 'asc' } },
              select: { classe: { select: SELECAO_REF_CLASSE } },
            },
            requisitosConcluidos: {
              where: { clubeId, removidoEm: null, requisito: { secao: { classeId } } },
              orderBy: { requisitoId: 'asc' },
              select: { requisitoId: true, concluidoEm: true, registroAulaId: true },
            },
          },
        },
      },
    })
    return matriculas
      .map((matricula) => matricula.dbv)
      .sort((a, b) => colador.compare(a.nome, b.nome) || a.id.localeCompare(b.id))
      .map((dbv) => {
        const atual = dbv.matriculas[0]?.classe
        return {
          dbvId: dbv.id,
          nome: dbv.nome,
          nomePublico: dbv.nomePublico,
          sexo: dbv.sexo,
          idade: idade(paraDataCivil(dbv.nascimento), hoje),
          classeAtual: atual ? refClasse(atual) : null,
          autorizacaoImagem: dbv.autorizacaoImagem,
          tipo: dbv.tipo,
          voce: ehFichaDaSessao(sessao, dbv.usuarioId),
          concluidos: dbv.requisitosConcluidos.map((conclusao) => conclusao.requisitoId),
          conclusoes: dbv.requisitosConcluidos.map((conclusao) => ({
            requisitoId: conclusao.requisitoId,
            concluidoEm: paraDataCivil(conclusao.concluidoEm),
            registroAulaId: conclusao.registroAulaId,
          })),
        }
      })
  }

  /** Da ultima publicacao, nunca do vivo. */
  private async aulasProximas(clubeId: string, classeId: string, ano: number, hoje: string): Promise<ClasseDoPacote['aulasProximas']> {
    const cronograma = await this.prisma.cronograma.findFirst({ where: { clubeId, classeId, anoClube: ano }, select: { id: true } })
    if (!cronograma) return []
    const publicacao = await this.cronogramas.ultimaPublicacao(clubeId, cronograma.id)
    const limite = somarDias(hoje, DIAS_DE_AULAS_PROXIMAS)
    return (publicacao?.aulas ?? [])
      .filter((aula) => aula.data >= hoje && aula.data <= limite)
      .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))
      .map((aula) => ({
        aulaPlanejadaId: aula.id,
        data: aula.data,
        horario: aula.horario,
        titulo: aula.titulo,
        requisitoIds: [...aula.requisitoIds].sort(),
      }))
  }

  private async registrosRecentes(clubeId: string, classeId: string, desde: string): Promise<ClasseDoPacote['registrosRecentes']> {
    const registros = await this.prisma.registroAula.findMany({
      where: { clubeId, classeId, data: { gte: daDataCivil(desde) } },
      orderBy: [{ data: 'asc' }, { id: 'asc' }],
      include: { presencas: { where: { clubeId }, orderBy: { dbvId: 'asc' }, select: { dbvId: true, presente: true, versao: true } } },
    })
    return registros.map((registro) => ({
      id: registro.id,
      data: paraDataCivil(registro.data),
      aulaPlanejadaId: registro.aulaPlanejadaId,
      presencas: registro.presencas.map((p) => ({ dbvId: p.dbvId, presente: p.presente, versao: p.versao.toISOString() })),
    }))
  }
}
