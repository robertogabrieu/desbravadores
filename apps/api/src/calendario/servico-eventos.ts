import { Injectable } from '@nestjs/common'
import {
  diasDeReuniao,
  emConflito,
  situacaoDaData,
  type AulaAfetada as AulaAfetadaContrato,
  type CalendarioSaida,
  type EventoDoCalendario,
  type EventoEntrada,
  type EventoGravadoSaida,
  type EventoSaida,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { ServicoAtividade } from '../atividades/servico-atividade'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoCronograma } from '../cronogramas/servico-cronograma'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import type { EventoCalendario, Prisma, Trilha } from '../generated/prisma/client.js'
import { ServicoNotificacoes } from '../notificacoes/servico-notificacoes'

type Entrada = z.infer<typeof EventoEntrada>
type Gravado = z.infer<typeof EventoGravadoSaida>
type Saida = z.infer<typeof EventoSaida>
type AulaAfetada = z.infer<typeof AulaAfetadaContrato>

/** Uma aula vista por uma das fontes (cronograma vivo ou última publicação). */
interface AulaVista {
  aulaId: string
  cronogramaId: string
  classeId: string
  trilha: Trilha
  data: string
  temRequisitos: boolean
}

const NAO_ENCONTRADO = 'Evento não encontrado.'

function paraSaida(evento: EventoCalendario): Saida {
  return {
    id: evento.id,
    nome: evento.nome,
    tipo: evento.tipo,
    inicio: paraDataCivil(evento.inicio),
    fim: paraDataCivil(evento.fim),
    horario: evento.horario,
    local: evento.local,
    cancelaReuniao: evento.cancelaReuniao,
    bloqueiaAula: evento.bloqueiaAula,
    bomParaCampo: evento.bomParaCampo,
  }
}

function paraCalendario(evento: Saida): EventoDoCalendario {
  return evento
}

function diaMes(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`
}

@Injectable()
export class ServicoEventos {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly cronogramas: ServicoCronograma,
    private readonly notificacoes: ServicoNotificacoes,
    private readonly atividades: ServicoAtividade,
  ) {}

  async doAno(clubeId: string, ano: number): Promise<z.infer<typeof CalendarioSaida>> {
    const inicio = `${ano}-01-01`
    const fim = `${ano}-12-31`
    const registros = await this.prisma.eventoCalendario.findMany({
      where: { clubeId, removidoEm: null, inicio: { lte: daDataCivil(fim) }, fim: { gte: daDataCivil(inicio) } },
      orderBy: [{ inicio: 'asc' }, { nome: 'asc' }, { id: 'asc' }],
    })
    const eventos = registros.map(paraSaida)
    const configuracao = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } })
    return { eventos, diasDeReuniao: diasDeReuniao(inicio, fim, configuracao.diaReuniao, eventos.map(paraCalendario)) }
  }

  criar(sessao: SessaoLogada, entrada: Entrada): Promise<Gravado> {
    return this.gravar(sessao, null, entrada)
  }

  editar(sessao: SessaoLogada, id: string, entrada: Entrada): Promise<Gravado> {
    return this.gravar(sessao, id, entrada)
  }

  async remover(sessao: SessaoLogada, id: string): Promise<void> {
    const atual = await this.eventoDoClube(sessao.clubeId, id)
    await this.transacao(sessao, atual, null, async (tx) => {
      await tx.eventoCalendario.update({ where: { id, clubeId: sessao.clubeId }, data: { removidoEm: new Date() } })
    })
  }

  private async gravar(sessao: SessaoLogada, id: string | null, entrada: Entrada): Promise<Gravado> {
    const atual = id ? await this.eventoDoClube(sessao.clubeId, id) : null
    const dados = { ...entrada, inicio: daDataCivil(entrada.inicio), fim: daDataCivil(entrada.fim) }
    let gravado: EventoCalendario | undefined
    const aulasAfetadas = await this.transacao(sessao, atual, entrada, async (tx) => {
      gravado = atual
        ? await tx.eventoCalendario.update({ where: { id: atual.id, clubeId: sessao.clubeId }, data: dados })
        : await tx.eventoCalendario.create({ data: { ...dados, clubeId: sessao.clubeId, criadoPorId: sessao.usuarioId } })
      if (!atual) {
        await this.atividades.registrar(tx, {
          clubeId: sessao.clubeId,
          autorId: sessao.usuarioId,
          tipo: 'EVENTO_CRIADO',
          descricao: `Evento criado: ${gravado.nome}`,
          link: '/adm/calendario',
        })
      }
    })
    if (!gravado) throw new Error('Evento não gravado')
    return { evento: paraSaida(gravado), aulasAfetadas }
  }

  private async eventoDoClube(clubeId: string, id: string): Promise<EventoCalendario> {
    const evento = await this.prisma.eventoCalendario.findFirst({ where: { id, clubeId, removidoEm: null } })
    if (!evento) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADO)
    return evento
  }

  /**
   * Roda `gravacao` e, na mesma transação, avisa das aulas que ENTRARAM em conflito por causa dela.
   * `depois` é o intervalo/marcações do evento após a gravação (null = evento removido).
   */
  private async transacao(
    sessao: SessaoLogada,
    antes: EventoCalendario | null,
    depois: Entrada | null,
    gravacao: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<AulaAfetada[]> {
    const { clubeId } = sessao
    const datas = [antes && paraDataCivil(antes.inicio), antes && paraDataCivil(antes.fim), depois?.inicio, depois?.fim].filter(
      (d): d is string => d != null,
    )
    const inicio = datas.reduce((menor, d) => (d < menor ? d : menor))
    const fim = datas.reduce((maior, d) => (d > maior ? d : maior))

    const [relogio, aulas, registros] = await Promise.all([
      this.escopo.relogio(clubeId),
      this.aulasVistas(clubeId, inicio, fim),
      this.registrosNoIntervalo(clubeId, inicio, fim),
    ])
    const vizinhos = await this.prisma.eventoCalendario.findMany({
      where: { clubeId, removidoEm: null, inicio: { lte: daDataCivil(fim) }, fim: { gte: daDataCivil(inicio) }, id: { not: antes?.id } },
    })
    const outros = vizinhos.map((evento) => paraCalendario(paraSaida(evento)))
    const eventosDepois = depois ? [...outros, depois] : outros
    const eventosAntes = antes ? [...outros, paraCalendario(paraSaida(antes))] : outros

    const conflitos = (eventos: EventoDoCalendario[]): Set<string> =>
      new Set(
        aulas
          .filter((aula) =>
            emConflito({
              trilha: aula.trilha,
              temRequisitos: aula.temRequisitos,
              temRegistro: registros.has(`${aula.classeId}|${aula.data}`),
              data: aula.data,
              hoje: relogio.hoje,
              situacaoDaData: situacaoDaData(aula.data, eventos),
            }),
          )
          .map((aula) => aula.aulaId),
      )
    const jaEmConflito = conflitos(eventosAntes)
    const emConflitoDepois = conflitos(eventosDepois)
    const entraram = new Map<string, AulaVista>()
    for (const aula of aulas) {
      if (emConflitoDepois.has(aula.aulaId) && !jaEmConflito.has(aula.aulaId)) entraram.set(aula.aulaId, aula)
    }

    return this.prisma.$transaction(async (tx) => {
      await gravacao(tx)
      return this.avisar(tx, sessao, [...entraram.values()])
    })
  }

  /** Aulas do cronograma vivo e da última publicação no intervalo, uma linha por (aula, fonte). */
  private async aulasVistas(clubeId: string, inicio: string, fim: string): Promise<AulaVista[]> {
    const cronogramas = await this.prisma.cronograma.findMany({
      where: { clubeId },
      select: { id: true, classeId: true, classe: { select: { trilha: true } } },
    })
    const trilhaDoCronograma = new Map(cronogramas.map((c) => [c.id, c]))
    const noIntervalo = (data: string): boolean => data >= inicio && data <= fim

    const vivas = await this.prisma.aulaPlanejada.findMany({
      where: { clubeId, removidaEm: null, data: { gte: daDataCivil(inicio), lte: daDataCivil(fim) } },
      select: { id: true, cronogramaId: true, data: true, _count: { select: { requisitos: true } } },
    })
    const doVivo = vivas.flatMap((aula): AulaVista[] => {
      const cronograma = trilhaDoCronograma.get(aula.cronogramaId)
      if (!cronograma) return []
      return [
        {
          aulaId: aula.id,
          cronogramaId: aula.cronogramaId,
          classeId: cronograma.classeId,
          trilha: cronograma.classe.trilha,
          data: paraDataCivil(aula.data),
          temRequisitos: aula._count.requisitos > 0,
        },
      ]
    })

    const publicacoes = await Promise.all(cronogramas.map((c) => this.cronogramas.ultimaPublicacao(clubeId, c.id)))
    const doPublicado = cronogramas.flatMap((cronograma, indice): AulaVista[] =>
      (publicacoes[indice]?.aulas ?? [])
        .filter((aula) => noIntervalo(aula.data))
        .map((aula) => ({
          aulaId: aula.id,
          cronogramaId: cronograma.id,
          classeId: cronograma.classeId,
          trilha: cronograma.classe.trilha,
          data: aula.data,
          temRequisitos: aula.requisitoIds.length > 0,
        })),
    )
    return [...doVivo, ...doPublicado]
  }

  /** Chaves "classe|data" de quem já tem RegistroAula (B6: por clube, classe e data). */
  private async registrosNoIntervalo(clubeId: string, inicio: string, fim: string): Promise<Set<string>> {
    const registros = await this.prisma.registroAula.findMany({
      where: { clubeId, data: { gte: daDataCivil(inicio), lte: daDataCivil(fim) } },
      select: { classeId: true, data: true },
    })
    return new Set(registros.map((r) => `${r.classeId}|${paraDataCivil(r.data)}`))
  }

  /** Uma notificação por (pessoa, classe); devolve as aulas afetadas ordenadas por data. */
  private async avisar(tx: Prisma.TransactionClient, sessao: SessaoLogada, entraram: AulaVista[]): Promise<AulaAfetada[]> {
    if (entraram.length === 0) return []
    const { clubeId } = sessao
    const classeIds = [...new Set(entraram.map((aula) => aula.classeId))]
    const [classes, ajustes, adms] = await Promise.all([
      tx.classe.findMany({ where: { id: { in: classeIds }, OR: [{ clubeId: null }, { clubeId }] }, select: SELECAO_REF_CLASSE }),
      tx.classeClube.findMany({ where: { clubeId, classeId: { in: classeIds } }, select: { classeId: true, quemMontaCronograma: true } }),
      tx.vinculo.findMany({ where: { clubeId, papel: 'ADM', ativo: true }, select: { usuarioId: true } }),
    ])
    const classePorId = new Map(classes.map((classe) => [classe.id, classe]))
    const quemMonta = new Map(ajustes.map((ajuste) => [ajuste.classeId, ajuste.quemMontaCronograma]))

    for (const classeId of classeIds) {
      const datas = [...new Set(entraram.filter((a) => a.classeId === classeId).map((a) => a.data))].sort()
      const classe = classePorId.get(classeId)
      const instrutores = await this.cronogramas.instrutoresDaClasse(clubeId, classeId)
      const admMonta = (quemMonta.get(classeId) ?? 'ADM') === 'ADM'
      const linkQuemMonta = `/cronograma/montar?classe=${classeId}`
      const linkQuemNaoMonta = `/cronograma?classe=${classeId}`
      const destinos = [
        ...instrutores.map((i) => ({ usuarioId: i.usuarioId, link: admMonta ? linkQuemNaoMonta : linkQuemMonta })),
        ...(admMonta ? adms.map((a) => ({ usuarioId: a.usuarioId, link: linkQuemMonta })) : []),
      ]
      await this.notificacoes.notificar(tx, {
        clubeId,
        destinos,
        tipo: 'CONFLITO_CRONOGRAMA',
        titulo: 'Aula em conflito com o calendário',
        texto: `${classe?.nome ?? 'Classe'}: ${datas.map(diaMes).join(', ')} deixou de ser dia de aula.`,
      })
    }

    return entraram
      .map((aula): AulaAfetada => {
        const classe = classePorId.get(aula.classeId)
        if (!classe) throw new Error('Classe da aula não encontrada')
        return { aulaId: aula.aulaId, cronogramaId: aula.cronogramaId, classe: refClasse(classe), data: aula.data }
      })
      .sort((a, b) => a.data.localeCompare(b.data) || a.aulaId.localeCompare(b.aulaId))
  }
}
