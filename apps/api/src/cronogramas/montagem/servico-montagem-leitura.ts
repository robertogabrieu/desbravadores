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
import { avancadaPareadaDe, regularDoPar } from '../../classes/par-regular-avancada'
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

  /**
   * Conselheiro 403; instrutor só as classes do vínculo e Adm só as oficiais ou do clube (senão 404). Na avançada,
   * o escopo do instrutor já traz a avançada da regular dele.
   */
  async classeDoEscopo(sessao: SessaoLogada, classeId: string) {
    if (sessao.papel === 'CONSELHEIRO') throw new ErroApp('SEM_PERMISSAO', 'Você não tem acesso ao cronograma.')
    const classe = await this.prisma.classe.findFirst({
      where: { id: classeId, OR: [{ clubeId: null }, { clubeId: sessao.clubeId }] },
      select: { ...SELECAO_REF_CLASSE, classeBaseId: true },
    })
    if (!classe) throw new ErroApp('NAO_ENCONTRADO', CLASSE_NAO_ENCONTRADA)
    if (sessao.papel === 'INSTRUTOR') {
      const doInstrutor = await this.escopo.classesDoInstrutor(sessao)
      if (!doInstrutor.includes(classe.id)) throw new ErroApp('NAO_ENCONTRADO', CLASSE_NAO_ENCONTRADA)
    }
    return classe
  }

  /** B3: Adm sempre; instrutor da classe só se o clube liberou a montagem para ele (na avançada com par ativo, vale o ajuste da regular). */
  async classeQueMonta(sessao: SessaoLogada, classeId: string) {
    const classe = await this.classeDoEscopo(sessao, classeId)
    if (sessao.papel === 'INSTRUTOR') {
      const ajuste = await this.prisma.classeClube.findUnique({
        where: { clubeId_classeId: { clubeId: sessao.clubeId, classeId: await this.classeDoCronograma(sessao.clubeId, classe) } },
        select: { quemMontaCronograma: true },
      })
      if (ajuste?.quemMontaCronograma !== 'INSTRUTOR') {
        throw new ErroApp('SEM_PERMISSAO', 'O Adm monta o cronograma desta classe.')
      }
    }
    return classe
  }

  /**
   * A classe dona do cronograma (e do ajuste de quem monta): a regular, quando a classe é avançada com o par ativo;
   * senão, ela mesma.
   */
  async classeDoCronograma(clubeId: string, classe: { id: string; classeBaseId: string | null }): Promise<string> {
    if (!classe.classeBaseId) return classe.id
    return (await regularDoPar(this.prisma, clubeId, classe.id)) ?? classe.id
  }

  /** As classes do par: a dona do cronograma e, sendo regular com par ativo, a avançada. Só elas aceitam requisito novo. */
  async classesDoPar(
    clubeId: string,
    cronograma: { classeId: string },
    db: Pick<Prisma.TransactionClient, 'classe'> = this.prisma,
  ): Promise<string[]> {
    const avancada = await avancadaPareadaDe(db, clubeId, cronograma.classeId)
    return avancada ? [cronograma.classeId, avancada.id] : [cronograma.classeId]
  }

  /**
   * As classes que o cronograma cobre: as do par mais as classes dos requisitos que já estão nele. Desfeito o par,
   * o requisito da avançada que ficou no cronograma da regular continua dele (e pode ser tirado).
   */
  async classesDoCronograma(
    clubeId: string,
    cronograma: { id: string; classeId: string },
    db: Pick<Prisma.TransactionClient, 'classe' | 'aulaRequisito'> = this.prisma,
  ): Promise<string[]> {
    const doPar = await this.classesDoPar(clubeId, cronograma, db)
    const ligacoes = await db.aulaRequisito.findMany({
      where: { clubeId, cronogramaId: cronograma.id },
      select: { requisito: { select: { secao: { select: { classeId: true } } } } },
    })
    return [...new Set([...doPar, ...ligacoes.map((ligacao) => ligacao.requisito.secao.classeId)])]
  }

  async montagem(sessao: SessaoLogada, classeId: string, anoClube?: number): Promise<Saida> {
    const pedida = await this.classeQueMonta(sessao, classeId)
    const { clubeId } = sessao
    const donaId = await this.classeDoCronograma(clubeId, pedida)
    const dona = donaId === pedida.id ? pedida : await this.prisma.classe.findFirstOrThrow({ where: { id: donaId, OR: [{ clubeId: null }, { clubeId }] }, select: SELECAO_REF_CLASSE })
    const relogio = await this.escopo.relogio(clubeId)
    const cronograma = await this.prisma.cronograma.findFirst({
      where: { clubeId, classeId: dona.id, anoClube: anoClube ?? relogio.anoClube },
      select: { id: true },
    })
    if (!cronograma) {
      const avancada = dona.trilha === 'INDIVIDUAL' && dona.tipo === 'REGULAR' ? await avancadaPareadaDe(this.prisma, clubeId, dona.id) : null
      return {
        cronograma: null,
        classe: refClasse(dona),
        datas: [],
        requisitos: [],
        datasLivres: dona.trilha === 'AGRUPADAS',
        avancada: avancada ? { id: avancada.id, nome: avancada.nome } : null,
      }
    }
    return this.saida(clubeId, cronograma.id)
  }

  /** O cronograma vivo como está agora no banco, com as classes que ele cobre (a regular e a avançada do par ativo). */
  async saida(clubeId: string, cronogramaId: string): Promise<Saida> {
    const cronograma = await this.prisma.cronograma.findFirstOrThrow({
      where: { clubeId, id: cronogramaId },
      include: { enviadoPor: { select: { nome: true } }, classe: { select: SELECAO_REF_CLASSE } },
    })
    const { classe } = cronograma
    const avancada = classe.tipo === 'REGULAR' && classe.trilha === 'INDIVIDUAL' ? await avancadaPareadaDe(this.prisma, clubeId, classe.id) : null
    const classeIdsDoPar = avancada ? [classe.id, avancada.id] : [classe.id]
    const [aulas, ligacoes, configuracao, relogio] = await Promise.all([
      this.prisma.aulaPlanejada.findMany({ where: { clubeId, cronogramaId, removidaEm: null } }),
      this.prisma.aulaRequisito.findMany({
        where: { clubeId, cronogramaId },
        select: { aulaPlanejadaId: true, requisitoId: true, requisito: { select: { secao: { select: { classeId: true } } } } },
      }),
      this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } }),
      this.escopo.relogio(clubeId),
    ])
    // Requisito de classe fora do par (a avançada, depois que o par se desfez) continua no cronograma até ser tirado.
    const classeIdsOrfas = [...new Set(ligacoes.map((ligacao) => ligacao.requisito.secao.classeId))].filter((id) => !classeIdsDoPar.includes(id))
    const classeIds = [...classeIdsDoPar, ...classeIdsOrfas]
    const inicio = paraDataCivil(cronograma.inicio)
    const fim = paraDataCivil(cronograma.fim)
    const datasComAula = aulas.map((aula) => paraDataCivil(aula.data))
    const [primeira, ultima] = [[inicio, ...datasComAula].sort()[0], [fim, ...datasComAula].sort().reverse()[0]]

    const [situacoes, eventos, registros] = await Promise.all([
      this.calendario.situacoes(clubeId, primeira, ultima),
      this.prisma.eventoCalendario.findMany({
        where: { clubeId, removidoEm: null, inicio: { lte: daDataCivil(fim) }, fim: { gte: daDataCivil(inicio) } },
        select: { nome: true, tipo: true, inicio: true, fim: true, horario: true, local: true, temReuniao: true, temClasse: true, bomParaCampo: true },
      }),
      this.prisma.registroAula.findMany({
        where: { clubeId, classeId: { in: classeIds }, data: { gte: daDataCivil(primeira), lte: daDataCivil(ultima) } },
        select: { classeId: true, data: true },
      }),
    ])
    const classesDadasPorData = new Map<string, string[]>()
    for (const registro of registros) {
      const data = paraDataCivil(registro.data)
      classesDadasPorData.set(data, [...(classesDadasPorData.get(data) ?? []), registro.classeId])
    }
    const eventosDoPeriodo: EventoDoCalendario[] = eventos.map((evento) => ({
      ...evento,
      inicio: paraDataCivil(evento.inicio),
      fim: paraDataCivil(evento.fim),
    }))
    const datasDoPeriodo = classe.trilha === 'INDIVIDUAL' ? datasDaMontagem(inicio, fim, configuracao.diaReuniao, eventosDoPeriodo) : []
    const datas = [...new Set([...datasDoPeriodo, ...datasComAula])].sort()
    const aulaPorData = new Map(aulas.map((aula) => [paraDataCivil(aula.data), aula]))

    const ligacaoPorRequisito = new Map(ligacoes.map((ligacao) => [ligacao.requisitoId, ligacao.aulaPlanejadaId]))
    // Da classe órfã só entra o que já está no cronograma: requisito novo dela não se coloca.
    const requisitosPorClasse = await Promise.all(
      classeIds.map(async (classeId) => {
        const requisitos = await this.requisitosDaClasse(clubeId, classeId)
        const visiveis = classeIdsOrfas.includes(classeId) ? requisitos.filter((requisito) => ligacaoPorRequisito.has(requisito.id)) : requisitos
        return visiveis.map((requisito) => ({ ...requisito, classeId }))
      }),
    )
    const dataPorAula = new Map(aulas.map((aula) => [aula.id, paraDataCivil(aula.data)]))

    return {
      cronograma: {
        id: cronograma.id,
        status: cronograma.status,
        anoClube: cronograma.anoClube,
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
        const ligacoesDaAula = aula ? ligacoes.filter((ligacao) => ligacao.aulaPlanejadaId === aula.id) : []
        const situacao = situacoes.get(data) ?? situacaoDaData(data, configuracao.diaReuniao, [])
        const classeIdsComAulaDada = classesDadasPorData.get(data) ?? []
        // O encontro é um só: basta uma das classes ter requisito na data, sem registro dela, para ele estar em conflito.
        const conflito =
          aula !== undefined &&
          classeIds.some((classeId) =>
            emConflito({
              trilha: classe.trilha,
              temRequisitos: ligacoesDaAula.some((ligacao) => ligacao.requisito.secao.classeId === classeId),
              temRegistro: classeIdsComAulaDada.includes(classeId),
              data,
              hoje: relogio.hoje,
              situacaoDaData: situacao,
            }),
          )
        return {
          data,
          aulaId: aula?.id ?? null,
          horario: aula?.horario ?? null,
          local: aula?.local ?? null,
          titulo: aula?.titulo ?? null,
          requisitoIds: ligacoesDaAula.map((ligacao) => ligacao.requisitoId),
          situacao,
          conflito,
          classeIdsComAulaDada,
        }
      }),
      requisitos: requisitosPorClasse.flat().map((requisito) => {
        const aulaId = ligacaoPorRequisito.get(requisito.id) ?? null
        return { ...requisito, aulaId, data: aulaId ? (dataPorAula.get(aulaId) ?? null) : null }
      }),
      datasLivres: classe.trilha === 'AGRUPADAS',
      avancada: avancada ? { id: avancada.id, nome: avancada.nome } : null,
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
