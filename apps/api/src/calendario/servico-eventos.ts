import { Injectable } from '@nestjs/common'
import {
  diasDeReuniao,
  DataCivil,
  Uuid,
  emConflito,
  hojeNoFuso,
  situacaoDaData,
  type AulaAfetada as AulaAfetadaContrato,
  type CalendarioSaida,
  type EventoDoCalendario,
  type EventoEntrada,
  type EventoGravadoSaida,
  type EventoSaida,
} from '@desbravadores/shared'
import { z } from 'zod'
import { ServicoAtividade } from '../atividades/servico-atividade'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
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

/** O que a transação lê do retrato que `CronogramaPublicacao.conteudo` guarda. */
const RetratoLido = z.object({ aulas: z.array(z.object({ id: Uuid, data: DataCivil, requisitoIds: z.array(Uuid) })) })

const NAO_ENCONTRADO = 'Evento não encontrado.'
const DA_CLASSE_BIBLICA = 'Este encontro é da Classe Bíblica: remarque ou cancele pela edição.'

/** O encontro ligado ao evento; a relação é pela chave (clubeId, eventoId), e os grupos levam o clube no where. */
function comEncontro(clubeId: string) {
  return {
    encontroClasseBiblica: {
      select: {
        edicaoId: true,
        canceladoEm: true,
        motivoCancelamento: true,
        edicao: {
          select: { grupos: { where: { clubeId, removidoEm: null }, orderBy: [{ ordem: 'asc' }, { id: 'asc' }], select: { nome: true } } },
        },
      },
    },
  } satisfies Prisma.EventoCalendarioInclude
}

type EventoComEncontro = Prisma.EventoCalendarioGetPayload<{ include: ReturnType<typeof comEncontro> }>

function classeBiblicaDe(evento: EventoComEncontro): Saida['classeBiblica'] {
  const encontro = evento.encontroClasseBiblica
  if (!encontro) return null
  return {
    edicaoId: encontro.edicaoId,
    grupos: encontro.edicao.grupos.map((grupo) => grupo.nome),
    cancelado: encontro.canceladoEm !== null,
    motivo: encontro.motivoCancelamento,
  }
}

function paraSaidaComEncontro(evento: EventoComEncontro): Saida {
  return { ...paraSaida(evento), classeBiblica: classeBiblicaDe(evento) }
}

function paraSaida(evento: EventoCalendario): Saida {
  return {
    id: evento.id,
    nome: evento.nome,
    tipo: evento.tipo,
    inicio: paraDataCivil(evento.inicio),
    fim: paraDataCivil(evento.fim),
    horario: evento.horario,
    local: evento.local,
    temReuniao: evento.temReuniao,
    temClasse: evento.temClasse,
    bomParaCampo: evento.bomParaCampo,
    classeBiblica: null,
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
    private readonly notificacoes: ServicoNotificacoes,
    private readonly atividades: ServicoAtividade,
  ) {}

  async doAno(clubeId: string, ano: number): Promise<z.infer<typeof CalendarioSaida>> {
    const inicio = `${ano}-01-01`
    const fim = `${ano}-12-31`
    const registros = await this.prisma.eventoCalendario.findMany({
      where: { clubeId, removidoEm: null, inicio: { lte: daDataCivil(fim) }, fim: { gte: daDataCivil(inicio) } },
      orderBy: [{ inicio: 'asc' }, { nome: 'asc' }, { id: 'asc' }],
      include: comEncontro(clubeId),
    })
    const eventos = registros.map(paraSaidaComEncontro)
    const configuracao = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } })
    return { eventos, diasDeReuniao: diasDeReuniao(inicio, fim, configuracao.diaReuniao, eventos.map(paraCalendario)) }
  }

  async obter(clubeId: string, id: string): Promise<Saida> {
    const evento = await this.prisma.eventoCalendario.findFirst({ where: { id, clubeId, removidoEm: null }, include: comEncontro(clubeId) })
    if (!evento) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADO)
    return paraSaidaComEncontro(evento)
  }

  criar(sessao: SessaoLogada, entrada: Entrada): Promise<Gravado> {
    return this.gravar(sessao, null, entrada)
  }

  editar(sessao: SessaoLogada, id: string, entrada: Entrada): Promise<Gravado> {
    return this.gravar(sessao, id, entrada)
  }

  async remover(sessao: SessaoLogada, id: string): Promise<void> {
    await this.transacao(sessao, id, null, async (tx) => {
      await tx.eventoCalendario.update({ where: { id, clubeId: sessao.clubeId }, data: { removidoEm: new Date() } })
    })
  }

  private async gravar(sessao: SessaoLogada, id: string | null, entrada: Entrada): Promise<Gravado> {
    const dados = { ...entrada, inicio: daDataCivil(entrada.inicio), fim: daDataCivil(entrada.fim) }
    let gravado: EventoCalendario | undefined
    const aulasAfetadas = await this.transacao(sessao, id, entrada, async (tx) => {
      gravado = id
        ? await tx.eventoCalendario.update({ where: { id, clubeId: sessao.clubeId }, data: dados })
        : await tx.eventoCalendario.create({ data: { ...dados, clubeId: sessao.clubeId, criadoPorId: sessao.usuarioId } })
      if (!id) {
        await this.atividades.registrar(tx, {
          clubeId: sessao.clubeId,
          autorId: sessao.usuarioId,
          tipo: 'EVENTO_CRIADO',
          descricao: `Evento criado: ${gravado.nome}`,
          link: `/adm/calendario/eventos/${gravado.id}`,
        })
      }
    })
    if (!gravado) throw new Error('Evento não gravado')
    return { evento: paraSaida(gravado), aulasAfetadas }
  }

  private async eventoDoClube(tx: Prisma.TransactionClient, clubeId: string, id: string): Promise<EventoCalendario> {
    const evento = await tx.eventoCalendario.findFirst({ where: { id, clubeId, removidoEm: null } })
    if (!evento) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADO)
    return evento
  }

  /**
   * Roda `gravacao` e, na mesma transação, avisa das aulas que ENTRARAM em conflito por causa dela.
   * `id` é o evento que já existia (null = criação); o estado anterior é lido já com o lock preso.
   * `depois` é o intervalo/marcações do evento após a gravação (null = evento removido).
   */
  private async transacao(
    sessao: SessaoLogada,
    id: string | null,
    depois: Entrada | null,
    gravacao: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<AulaAfetada[]> {
    const { clubeId } = sessao
    // Serializa as gravações de eventos do clube: o "antes/depois" só vale lendo os vizinhos já confirmados pela gravação anterior.
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('eventos-do-clube'), hashtext(${clubeId}))`
        const antes = id ? await this.eventoDoClube(tx, clubeId, id) : null
        // O encontro é da edição: remarcar ou cancelar por aqui burlaria "com chamada não remarca".
        if (antes?.tipo === 'CLASSE_BIBLICA' || depois?.tipo === 'CLASSE_BIBLICA') throw new ErroApp('REGRA', DA_CLASSE_BIBLICA)
        if (depois?.tipo === 'REUNIAO_EXTRA') await this.exigirUmaExtraPorData(tx, clubeId, depois.inicio, antes?.id)
        const datas = [antes && paraDataCivil(antes.inicio), antes && paraDataCivil(antes.fim), depois?.inicio, depois?.fim].filter(
          (d): d is string => d != null,
        )
        const inicio = datas.reduce((menor, d) => (d < menor ? d : menor))
        const fim = datas.reduce((maior, d) => (d > maior ? d : maior))

        // Tudo lê pela própria `tx`: com o lock preso, outra conexão do pool esgotaria o pool sob concorrência.
        const configuracao = await tx.configuracaoClube.findUniqueOrThrow({ where: { clubeId } })
        const hoje = hojeNoFuso(configuracao.fuso, new Date())
        const aulas = await this.aulasVistas(tx, clubeId, inicio, fim)
        const registros = await this.registrosNoIntervalo(tx, clubeId, inicio, fim)
        const vizinhos = await tx.eventoCalendario.findMany({
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
                  hoje,
                  situacaoDaData: situacaoDaData(aula.data, configuracao.diaReuniao, eventos),
                }),
              )
              .map((aula) => aula.aulaId),
          )
        const jaEmConflito = conflitos(eventosAntes)
        const emConflitoDepois = conflitos(eventosDepois)
        // Data sem evento nunca é conflito; por isso a classe que só cabia numa extra (ou num campo) é avisada pela troca de temClasse.
        const temClasse = (aula: AulaVista, eventos: EventoDoCalendario[]): boolean =>
          situacaoDaData(aula.data, configuracao.diaReuniao, eventos).temClasse
        const perdeuAClasse = (aula: AulaVista): boolean =>
          aula.trilha === 'INDIVIDUAL' &&
          aula.temRequisitos &&
          !registros.has(`${aula.classeId}|${aula.data}`) &&
          aula.data >= hoje &&
          temClasse(aula, eventosAntes) &&
          !temClasse(aula, eventosDepois)
        const entraram = new Map<string, AulaVista>()
        for (const aula of aulas) {
          const entrouEmConflito = emConflitoDepois.has(aula.aulaId) && !jaEmConflito.has(aula.aulaId)
          if (entrouEmConflito || perdeuAClasse(aula)) entraram.set(aula.aulaId, aula)
        }

        await gravacao(tx)
        return this.avisar(tx, sessao, [...entraram.values()])
      },
      { timeout: 20_000 },
    )
  }

  private async exigirUmaExtraPorData(tx: Prisma.TransactionClient, clubeId: string, data: string, idDoProprio?: string): Promise<void> {
    const jaExiste = await tx.eventoCalendario.count({
      where: { clubeId, removidoEm: null, tipo: 'REUNIAO_EXTRA', inicio: daDataCivil(data), id: { not: idDoProprio } },
    })
    if (jaExiste > 0) throw new ErroApp('VALIDACAO', 'Confira os campos informados.', { inicio: 'Já há uma reunião extra nesta data.' })
  }

  /** Aulas do cronograma vivo e da última publicação no intervalo, uma linha por (aula, fonte). */
  private async aulasVistas(tx: Prisma.TransactionClient, clubeId: string, inicio: string, fim: string): Promise<AulaVista[]> {
    const cronogramas = await tx.cronograma.findMany({
      where: { clubeId },
      select: { id: true, classeId: true, classe: { select: { trilha: true } } },
    })
    const trilhaDoCronograma = new Map(cronogramas.map((c) => [c.id, c]))
    const noIntervalo = (data: string): boolean => data >= inicio && data <= fim

    const vivas = await tx.aulaPlanejada.findMany({
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

    const publicacoes = await Promise.all(cronogramas.map((c) => this.aulasDaUltimaPublicacao(tx, clubeId, c.id)))
    const doPublicado = cronogramas.flatMap((cronograma, indice): AulaVista[] =>
      publicacoes[indice]
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

  /** As aulas do retrato mais recente do cronograma, deduplicadas por id (o mesmo que `ServicoCronograma.ultimaPublicacao`, pela `tx`). */
  private async aulasDaUltimaPublicacao(tx: Prisma.TransactionClient, clubeId: string, cronogramaId: string) {
    const publicacao = await tx.cronogramaPublicacao.findFirst({
      where: { clubeId, cronogramaId },
      orderBy: [{ publicadoEm: 'desc' }, { id: 'desc' }],
      select: { conteudo: true },
    })
    if (!publicacao) return []
    const porId = new Map(RetratoLido.parse(publicacao.conteudo).aulas.map((aula) => [aula.id, aula]))
    return [...porId.values()]
  }

  /** Chaves "classe|data" de quem já tem RegistroAula (B6: por clube, classe e data). */
  private async registrosNoIntervalo(tx: Prisma.TransactionClient, clubeId: string, inicio: string, fim: string): Promise<Set<string>> {
    const registros = await tx.registroAula.findMany({
      where: { clubeId, data: { gte: daDataCivil(inicio), lte: daDataCivil(fim) } },
      select: { classeId: true, data: true },
    })
    return new Set(registros.map((r) => `${r.classeId}|${paraDataCivil(r.data)}`))
  }

  /** Instrutores ativos DO CLUBE ligados à classe (a mesma regra de `ServicoCronograma.instrutoresDaClasse`, pela `tx`). */
  private async instrutoresDaClasse(tx: Prisma.TransactionClient, clubeId: string, classeId: string): Promise<{ usuarioId: string }[]> {
    const vinculos = await tx.vinculo.findMany({
      where: { clubeId, papel: 'INSTRUTOR', ativo: true, classes: { some: { classeId } } },
      select: { usuario: { select: { id: true, nome: true } } },
      orderBy: { usuario: { nome: 'asc' } },
    })
    return vinculos.map((vinculo) => ({ usuarioId: vinculo.usuario.id }))
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
      const instrutores = await this.instrutoresDaClasse(tx, clubeId, classeId)
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
        titulo: 'Classe em conflito com o calendário',
        texto: `${classe?.nome ?? 'Classe'}: ${datas.map(diaMes).join(', ')} deixou de ser dia de classe.`,
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
