import { Injectable } from '@nestjs/common'
import type { AulaDetalhe, AulaResumo } from '@desbravadores/shared'
import type { z } from 'zod'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoCronograma } from '../cronogramas/servico-cronograma'
import { colador, daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import { dentroDoPrazoDeCorrecao } from '../reunioes/apoio'
import { exigirClasseNoEscopo, intervaloDoAnoClube, resumosDeRequisitos } from './apoio'

type Resumo = z.infer<typeof AulaResumo>
type Detalhe = z.infer<typeof AulaDetalhe>

const NAO_ENCONTRADA = 'Aula não encontrada.'

@Injectable()
export class AulasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly cronogramas: ServicoCronograma,
  ) {}

  /** `GET /classes/:id/aulas?anoClube`: uma linha por aula do ano do clube, da mais recente a mais antiga. */
  async listar(sessao: SessaoLogada, classeId: string, anoClube?: number): Promise<Resumo[]> {
    const { clubeId } = sessao
    await exigirClasseNoEscopo(this.prisma, this.escopo, sessao, classeId)
    const relogio = await this.escopo.relogio(clubeId)
    const periodo = intervaloDoAnoClube(anoClube ?? relogio.anoClube, relogio.inicioAnoClube)
    const registros = await this.prisma.registroAula.findMany({
      where: { clubeId, classeId, data: { gte: daDataCivil(periodo.inicio), lte: daDataCivil(periodo.fim) } },
      orderBy: { data: 'desc' },
      include: {
        presencas: { where: { clubeId }, select: { presente: true } },
        requisitos: { where: { clubeId, removidoEm: null }, select: { id: true } },
      },
    })
    return registros.map((registro) => ({
      id: registro.id,
      data: paraDataCivil(registro.data),
      presentes: registro.presencas.filter((presenca) => presenca.presente).length,
      total: registro.presencas.length,
      requisitosConcluidos: registro.requisitos.length,
    }))
  }

  /** `GET /aulas/:id`. Aula de outra classe do instrutor ou de outro clube e igual a inexistente: 404. */
  async detalhe(sessao: SessaoLogada, id: string, agora: Date = new Date()): Promise<Detalhe> {
    const { clubeId } = sessao
    const registro = await this.prisma.registroAula.findFirst({
      where: { clubeId, id },
      include: {
        classe: { select: SELECAO_REF_CLASSE },
        registradoPor: { select: { nome: true } },
        presencas: { where: { clubeId }, include: { dbv: { select: { nome: true } } } },
        requisitos: { where: { clubeId, removidoEm: null }, select: { dbvId: true, requisitoId: true } },
      },
    })
    if (!registro) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADA)
    await exigirClasseNoEscopo(this.prisma, this.escopo, sessao, registro.classeId).catch(() => {
      throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADA)
    })

    const [configuracao, planejados] = await Promise.all([
      this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } }),
      this.requisitosPlanejados(clubeId, registro.aulaPlanejadaId),
    ])
    const idsDosRequisitos = [...new Set([...planejados, ...registro.requisitos.map((conclusao) => conclusao.requisitoId)])]
    const requisitosDaAula = await resumosDeRequisitos(this.prisma, clubeId, { id: { in: idsDosRequisitos } }, false)

    return {
      id: registro.id,
      classe: refClasse(registro.classe),
      data: paraDataCivil(registro.data),
      aulaPlanejadaId: registro.aulaPlanejadaId,
      registradoPor: registro.registradoPor.nome,
      presencas: registro.presencas
        .map((presenca) => ({
          dbvId: presenca.dbvId,
          nome: presenca.dbv.nome,
          presente: presenca.presente,
          versao: presenca.versao.toISOString(),
        }))
        .sort((a, b) => colador.compare(a.nome, b.nome) || a.dbvId.localeCompare(b.dbvId)),
      requisitosDaAula,
      concluidosNaAula: registro.requisitos.map(({ dbvId, requisitoId }) => ({ dbvId, requisitoId })),
      podeEditar: sessao.papel === 'ADM' || dentroDoPrazoDeCorrecao(paraDataCivil(registro.data), agora, configuracao.fuso),
    }
  }

  /** Requisitos da aula planejada: os da ultima publicacao e, se ela nao esta la (vivo), os do cronograma vivo. */
  private async requisitosPlanejados(clubeId: string, aulaPlanejadaId: string | null): Promise<string[]> {
    if (aulaPlanejadaId === null) return []
    const planejada = await this.prisma.aulaPlanejada.findFirst({ where: { clubeId, id: aulaPlanejadaId }, select: { cronogramaId: true } })
    if (!planejada) return []
    const publicacao = await this.cronogramas.ultimaPublicacao(clubeId, planejada.cronogramaId)
    const publicada = publicacao?.aulas.find((aula) => aula.id === aulaPlanejadaId)
    if (publicada) return publicada.requisitoIds
    const ligacoes = await this.prisma.aulaRequisito.findMany({
      where: { clubeId, aulaPlanejadaId },
      select: { requisitoId: true },
    })
    return ligacoes.map((ligacao) => ligacao.requisitoId)
  }
}
