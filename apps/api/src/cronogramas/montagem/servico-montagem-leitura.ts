import { Injectable } from '@nestjs/common'
import {
  datasDaMontagem,
  emConflito,
  situacaoDaData,
  type EventoDoCalendario,
  type MontagemSaida,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { refClasse, SELECAO_REF_CLASSE } from '../../classes/apresentacao-classe'
import type { SessaoLogada } from '../../comum/decorators/sessao.decorator'
import { ErroApp } from '../../comum/erros'
import { PrismaService } from '../../comum/prisma/prisma.service'
import { ServicoCalendario } from '../../calendario/servico-calendario'
import { daDataCivil, paraDataCivil } from '../../desbravadores/apoio'
import { ServicoEscopo } from '../../desbravadores/escopo.service'
import type { Prisma } from '../../generated/prisma/client.js'

type Saida = z.infer<typeof MontagemSaida>

const CLASSE_NAO_ENCONTRADA = 'Classe não encontrada.'

/** Acesso à montagem (B3) e leitura do cronograma vivo no formato que as duas telas de montagem usam. */
@Injectable()
export class ServicoMontagemLeitura {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly calendario: ServicoCalendario,
  ) {}

  /** Conselheiro 403; instrutor só as classes do vínculo e Adm só as oficiais ou do clube (senão 404). */
  async classeDoEscopo(sessao: SessaoLogada, classeId: string) {
    if (sessao.papel === 'CONSELHEIRO') throw new ErroApp('SEM_PERMISSAO', 'Você não tem acesso ao cronograma.')
    if (sessao.papel === 'INSTRUTOR' && !(await this.escopo.classesDoInstrutor(sessao)).includes(classeId)) {
      throw new ErroApp('NAO_ENCONTRADO', CLASSE_NAO_ENCONTRADA)
    }
    const classe = await this.prisma.classe.findFirst({
      where: { id: classeId, OR: [{ clubeId: null }, { clubeId: sessao.clubeId }] },
      select: SELECAO_REF_CLASSE,
    })
    if (!classe) throw new ErroApp('NAO_ENCONTRADO', CLASSE_NAO_ENCONTRADA)
    return classe
  }

  /** B3: Adm sempre; instrutor da classe só se o clube liberou a montagem daquela classe para ele. */
  async classeQueMonta(sessao: SessaoLogada, classeId: string) {
    const classe = await this.classeDoEscopo(sessao, classeId)
    if (sessao.papel === 'INSTRUTOR') {
      const ajuste = await this.prisma.classeClube.findUnique({
        where: { clubeId_classeId: { clubeId: sessao.clubeId, classeId } },
        select: { quemMontaCronograma: true },
      })
      if (ajuste?.quemMontaCronograma !== 'INSTRUTOR') {
        throw new ErroApp('SEM_PERMISSAO', 'O Adm monta o cronograma desta classe.')
      }
    }
    return classe
  }

  async montagem(sessao: SessaoLogada, classeId: string, anoClube?: number): Promise<Saida> {
    const classe = await this.classeQueMonta(sessao, classeId)
    const relogio = await this.escopo.relogio(sessao.clubeId)
    const cronograma = await this.prisma.cronograma.findFirst({
      where: { clubeId: sessao.clubeId, classeId, anoClube: anoClube ?? relogio.anoClube },
      select: { id: true },
    })
    if (!cronograma) {
      return { cronograma: null, classe: refClasse(classe), datas: [], requisitos: [], datasLivres: classe.trilha === 'AGRUPADAS' }
    }
    return this.saida(sessao.clubeId, cronograma.id)
  }

  /** O cronograma vivo como está agora no banco. */
  async saida(clubeId: string, cronogramaId: string): Promise<Saida> {
    const cronograma = await this.prisma.cronograma.findFirstOrThrow({
      where: { clubeId, id: cronogramaId },
      include: { enviadoPor: { select: { nome: true } }, classe: { select: SELECAO_REF_CLASSE } },
    })
    const { classe } = cronograma
    const [aulas, ligacoes, configuracao, relogio] = await Promise.all([
      this.prisma.aulaPlanejada.findMany({ where: { clubeId, cronogramaId, removidaEm: null } }),
      this.prisma.aulaRequisito.findMany({ where: { clubeId, cronogramaId }, select: { aulaPlanejadaId: true, requisitoId: true } }),
      this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } }),
      this.escopo.relogio(clubeId),
    ])
    const inicio = paraDataCivil(cronograma.inicio)
    const fim = paraDataCivil(cronograma.fim)
    const datasDasAulas = aulas.map((aula) => paraDataCivil(aula.data))
    const [primeira, ultima] = [[inicio, ...datasDasAulas].sort()[0], [fim, ...datasDasAulas].sort().reverse()[0]]

    const [situacoes, eventos, registros] = await Promise.all([
      this.calendario.situacoes(clubeId, primeira, ultima),
      this.prisma.eventoCalendario.findMany({
        where: { clubeId, removidoEm: null, inicio: { lte: daDataCivil(fim) }, fim: { gte: daDataCivil(inicio) } },
        select: { nome: true, tipo: true, inicio: true, fim: true, horario: true, local: true, temReuniao: true, temClasse: true, bomParaCampo: true },
      }),
      this.prisma.registroAula.findMany({
        where: { clubeId, classeId: classe.id, data: { gte: daDataCivil(primeira), lte: daDataCivil(ultima) } },
        select: { data: true },
      }),
    ])
    const datasDadas = new Set(registros.map((registro) => paraDataCivil(registro.data)))
    const eventosDoPeriodo: EventoDoCalendario[] = eventos.map((evento) => ({
      ...evento,
      inicio: paraDataCivil(evento.inicio),
      fim: paraDataCivil(evento.fim),
    }))
    const datasDoPeriodo = classe.trilha === 'INDIVIDUAL' ? datasDaMontagem(inicio, fim, configuracao.diaReuniao, eventosDoPeriodo) : []
    const datas = [...new Set([...datasDoPeriodo, ...datasDasAulas])].sort()
    const aulaPorData = new Map(aulas.map((aula) => [paraDataCivil(aula.data), aula]))

    const requisitos = await this.requisitosDaClasse(clubeId, classe.id)
    const ligacaoPorRequisito = new Map(ligacoes.map((ligacao) => [ligacao.requisitoId, ligacao.aulaPlanejadaId]))
    const dataPorAula = new Map(aulas.map((aula) => [aula.id, paraDataCivil(aula.data)]))

    return {
      cronograma: {
        id: cronograma.id,
        status: cronograma.status,
        inicio,
        fim,
        enviadoEm: cronograma.enviadoEm?.toISOString() ?? null,
        enviadoPor: cronograma.enviadoPor?.nome ?? null,
        publicadoEm: await this.publicadoEm(clubeId, cronogramaId),
        atualizadoEm: cronograma.atualizadoEm.toISOString(),
      },
      classe: refClasse(classe),
      datas: datas.map((data) => {
        const aula = aulaPorData.get(data)
        const requisitoIds = aula ? ligacoes.filter((l) => l.aulaPlanejadaId === aula.id).map((l) => l.requisitoId) : []
        const situacao = situacoes.get(data) ?? situacaoDaData(data, configuracao.diaReuniao, [])
        const aulaDada = datasDadas.has(data)
        return {
          data,
          aulaId: aula?.id ?? null,
          horario: aula?.horario ?? null,
          local: aula?.local ?? null,
          titulo: aula?.titulo ?? null,
          requisitoIds,
          situacao,
          conflito:
            aula !== undefined &&
            emConflito({ trilha: classe.trilha, temRequisitos: requisitoIds.length > 0, temRegistro: aulaDada, data, hoje: relogio.hoje, situacaoDaData: situacao }),
          aulaDada,
        }
      }),
      requisitos: requisitos.map((requisito) => {
        const aulaId = ligacaoPorRequisito.get(requisito.id) ?? null
        return { ...requisito, aulaId, data: aulaId ? (dataPorAula.get(aulaId) ?? null) : null }
      }),
      datasLivres: classe.trilha === 'AGRUPADAS',
    }
  }

  /**
   * Requisitos ativos para o clube (oficial ativo e não desligado pelo ajuste), com o `campo` ajustado, na ordem do caderno.
   * Com o cronograma travado, quem chama passa a `tx` para a leitura não disputar outra conexão com a trava.
   */
  async requisitosDaClasse(clubeId: string, classeId: string, db: Pick<Prisma.TransactionClient, 'requisito' | 'requisitoAjuste'> = this.prisma) {
    const requisitos = await db.requisito.findMany({
      where: { secao: { classeId } },
      orderBy: [{ secao: { ordem: 'asc' } }, { ordem: 'asc' }],
      select: { id: true, codigo: true, texto: true, campo: true, ativo: true, secao: { select: { codigo: true } } },
    })
    const ajustes = await db.requisitoAjuste.findMany({
      where: { clubeId, requisitoId: { in: requisitos.map((requisito) => requisito.id) } },
      select: { requisitoId: true, ativo: true, campo: true },
    })
    const ajustePorRequisito = new Map(ajustes.map((ajuste) => [ajuste.requisitoId, ajuste]))
    return requisitos
      // Quem saiu do caderno oficial não volta por ajuste do clube; o ajuste só desliga (a mesma regra de GET /classes/:id).
      .filter((requisito) => requisito.ativo && ajustePorRequisito.get(requisito.id)?.ativo !== false)
      .map((requisito) => ({
        id: requisito.id,
        codigo: requisito.codigo,
        texto: requisito.texto,
        campo: ajustePorRequisito.get(requisito.id)?.campo ?? requisito.campo,
        secaoCodigo: requisito.secao.codigo,
      }))
  }

  private async publicadoEm(clubeId: string, cronogramaId: string): Promise<string | null> {
    const publicacao = await this.prisma.cronogramaPublicacao.findFirst({
      where: { clubeId, cronogramaId },
      orderBy: [{ publicadoEm: 'desc' }, { id: 'desc' }],
      select: { publicadoEm: true },
    })
    return publicacao?.publicadoEm.toISOString() ?? null
  }
}
