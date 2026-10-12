import { Injectable } from '@nestjs/common'
import { hojeNoFuso } from '@desbravadores/shared'
import type { ConclusaoEntrada, ConclusaoSaida, PresencaDoEventoEntrada, PresencaDoEventoResposta, PresencaDoEventoSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { colador, paraDataCivil } from '../desbravadores/apoio'
import type { EventoCalendario, Prisma } from '../generated/prisma/client.js'
import { rosterDoMes, type FichaDoRoster } from '../ranking/calculo-ranking'
import { ServicoPontosEvento, type CriteriosDoEvento } from './servico-pontos-evento'
import { travarPresencaDoEvento } from './travas'

type Tx = Prisma.TransactionClient
type Lista = z.infer<typeof PresencaDoEventoSaida>
type Marcada = z.infer<typeof PresencaDoEventoResposta>
type Concluida = z.infer<typeof ConclusaoSaida>
type Resumo = Lista['resumo']
type Linha = Lista['unidades'][number]['linhas'][number]

interface Marca {
  foi: boolean
  comUniforme: boolean
}

/** A lista de um evento: quem entra (o ranking do mês dele, de quem já era do clube no dia) e o que está marcado. */
interface Situacao {
  roster: FichaDoRoster[]
  marcas: Map<string, Marca>
}

const NAO_ENCONTRADO = 'Evento não encontrado.'
const TEMPO_DA_TRANSACAO_MS = 20_000
const TIPO_DA_ATIVIDADE = 'LISTA_DE_EVENTO_ALTERADA'
const SEM_UNIDADE = 'Sem unidade'
const SEM_MARCA: Marca = { foi: false, comUniforme: false }

/** Lista "quem foi" do evento especial: marcas em rascunho até concluir; concluída, cada marca ajusta os pontos na hora. */
@Injectable()
export class ServicoPresenca {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pontosDoEvento: ServicoPontosEvento,
  ) {}

  async lista(clubeId: string, eventoId: string): Promise<Lista> {
    const evento = await eventoEspecial(this.prisma, clubeId, eventoId)
    const hoje = await hojeDoClube(this.prisma, clubeId)
    const situacao = await lerSituacao(this.prisma, clubeId, evento)
    return {
      unidades: agruparPorUnidade(situacao),
      resumo: resumoDe(situacao),
      aberta: hoje >= paraDataCivil(evento.inicio),
      listaConcluidaEm: evento.listaConcluidaEm?.toISOString() ?? null,
    }
  }

  async marcar(sessao: SessaoLogada, eventoId: string, entrada: z.infer<typeof PresencaDoEventoEntrada>): Promise<Marcada> {
    const { clubeId, usuarioId } = sessao
    return this.prisma.$transaction(
      async (tx) => {
        await travarPresencaDoEvento(tx, eventoId)
        const evento = await eventoEspecial(tx, clubeId, eventoId)
        await exigirAberta(tx, clubeId, evento)
        const situacao = await lerSituacao(tx, clubeId, evento)
        const noRoster = new Map(situacao.roster.map((ficha) => [ficha.id, ficha]))
        const conhecidos = await nomesDoClube(tx, clubeId, entrada.marcas.map((marca) => marca.dbvId))

        // Aplica as marcas na ordem em que vieram; o que não é do clube é ignorado, sem aviso nem eco.
        const depois = new Map(situacao.marcas)
        const tocados: string[] = []
        for (const marca of entrada.marcas) {
          if (!conhecidos.has(marca.dbvId)) continue
          const antes = depois.get(marca.dbvId) ?? SEM_MARCA
          const foi = marca.foi ?? antes.foi
          if (marca.comUniforme === true && !foi) {
            throw new ErroApp('VALIDACAO', 'Confira os campos informados.', { comUniforme: 'Só quem foi pode ter o uniforme marcado.' })
          }
          depois.set(marca.dbvId, { foi, comUniforme: foi && (marca.comUniforme ?? antes.comUniforme) })
          if (!tocados.includes(marca.dbvId)) tocados.push(marca.dbvId)
        }

        const mudados = tocados.filter((dbvId) => mudou(situacao.marcas.get(dbvId), depois.get(dbvId)))
        for (const dbvId of mudados) await gravarMarca(tx, clubeId, eventoId, dbvId, depois.get(dbvId) ?? SEM_MARCA, usuarioId)
        if (evento.listaConcluidaEm) {
          await this.ajustarPontos(tx, sessao, evento, mudados.filter((dbvId) => noRoster.has(dbvId)), situacao.marcas, depois, conhecidos)
        }

        const aposMarcas: Situacao = { roster: situacao.roster, marcas: depois }
        return {
          linhas: tocados.flatMap((dbvId) => {
            const ficha = noRoster.get(dbvId)
            return ficha ? [linhaDe(ficha, depois.get(dbvId) ?? SEM_MARCA)] : []
          }),
          resumo: resumoDe(aposMarcas),
          listaConcluidaEm: evento.listaConcluidaEm?.toISOString() ?? null,
          avisos: tocados.filter((dbvId) => !noRoster.has(dbvId)).map((dbvId) => avisoDeFora(conhecidos.get(dbvId) ?? '')),
        }
      },
      { timeout: TEMPO_DA_TRANSACAO_MS },
    )
  }

  async concluir(sessao: SessaoLogada, eventoId: string, entrada: z.infer<typeof ConclusaoEntrada>): Promise<Concluida> {
    const { clubeId } = sessao
    return this.prisma.$transaction(
      async (tx) => {
        await travarPresencaDoEvento(tx, eventoId)
        const evento = await eventoEspecial(tx, clubeId, eventoId)
        await exigirAberta(tx, clubeId, evento)
        const situacao = await lerSituacao(tx, clubeId, evento)
        const resumo = resumoDe(situacao)
        if (resumo.foram !== entrada.foram || resumo.uniformizados !== entrada.uniformizados) {
          throw new ErroApp(
            'REGRA',
            `A lista mudou desde que você abriu: agora são ${resumo.foram} que foram e ${resumo.uniformizados} com o uniforme, e eram ${entrada.foram} e ${entrada.uniformizados}. Confira os números e conclua de novo.`,
          )
        }
        const avisos = await avisosDeQuemSaiu(tx, clubeId, situacao)
        if (evento.listaConcluidaEm) {
          return { foram: resumo.foram, uniformizados: resumo.uniformizados, listaConcluidaEm: evento.listaConcluidaEm.toISOString(), avisos }
        }

        const criterios = await this.pontosDoEvento.criterios(tx, clubeId)
        const concluidaEm = new Date()
        await tx.eventoCalendario.update({ where: { id: evento.id, clubeId }, data: { listaConcluidaEm: concluidaEm } })
        await this.lancarQuemFoi(tx, sessao, evento, situacao, criterios)
        return { foram: resumo.foram, uniformizados: resumo.uniformizados, listaConcluidaEm: concluidaEm.toISOString(), avisos }
      },
      { timeout: TEMPO_DA_TRANSACAO_MS },
    )
  }

  /** Só o roster pontua; as linhas de fora ficam guardadas. */
  private async lancarQuemFoi(tx: Tx, sessao: SessaoLogada, evento: EventoCalendario, situacao: Situacao, criterios: CriteriosDoEvento): Promise<void> {
    for (const ficha of situacao.roster) {
      const marca = situacao.marcas.get(ficha.id)
      if (!marca?.foi) continue
      await this.pontosDoEvento.sincronizar(tx, {
        clubeId: sessao.clubeId,
        evento,
        dbvId: ficha.id,
        foi: true,
        comUniforme: marca.comUniforme,
        lancadoPorId: sessao.usuarioId,
        criterios,
      })
    }
  }

  /** Lista concluída: a marca nova acerta os pontos da pessoa na hora e fica registrada em `Atividade`. */
  private async ajustarPontos(
    tx: Tx,
    sessao: SessaoLogada,
    evento: EventoCalendario,
    dbvIds: string[],
    antes: Map<string, Marca>,
    depois: Map<string, Marca>,
    nomes: Map<string, string>,
  ): Promise<void> {
    if (dbvIds.length === 0) return
    const criterios = await this.pontosDoEvento.criterios(tx, sessao.clubeId)
    for (const dbvId of dbvIds) {
      const marca = depois.get(dbvId) ?? SEM_MARCA
      await this.pontosDoEvento.sincronizar(tx, {
        clubeId: sessao.clubeId,
        evento,
        dbvId,
        foi: marca.foi,
        comUniforme: marca.comUniforme,
        lancadoPorId: sessao.usuarioId,
        criterios,
      })
      // Escrita direta: `ServicoAtividade.registrar` só aceita os tipos do feed, e este não entra nele.
      await tx.atividade.create({
        data: {
          clubeId: sessao.clubeId,
          autorId: sessao.usuarioId,
          tipo: TIPO_DA_ATIVIDADE,
          descricao: `Lista de ${evento.nome}: ${nomes.get(dbvId) ?? ''} passou de "${situacaoEmTexto(antes.get(dbvId))}" para "${situacaoEmTexto(marca)}".`,
          link: `/adm/calendario/eventos/${evento.id}`,
        },
      })
    }
  }
}

async function eventoEspecial(db: Tx, clubeId: string, id: string): Promise<EventoCalendario> {
  const evento = await db.eventoCalendario.findFirst({ where: { id, clubeId, removidoEm: null, tipo: 'EVENTO_ESPECIAL' } })
  if (!evento) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADO)
  return evento
}

async function hojeDoClube(db: Tx, clubeId: string): Promise<string> {
  const configuracao = await db.configuracaoClube.findUniqueOrThrow({ where: { clubeId }, select: { fuso: true } })
  return hojeNoFuso(configuracao.fuso, new Date())
}

async function exigirAberta(db: Tx, clubeId: string, evento: EventoCalendario): Promise<void> {
  const inicio = paraDataCivil(evento.inicio)
  if ((await hojeDoClube(db, clubeId)) >= inicio) return
  throw new ErroApp('REGRA', `A lista deste evento só abre no dia dele, ${inicio.slice(8, 10)}/${inicio.slice(5, 7)}.`)
}

async function lerSituacao(db: Tx, clubeId: string, evento: EventoCalendario): Promise<Situacao> {
  const roster = await rosterDoMes(db, clubeId, paraDataCivil(evento.inicio).slice(0, 7), { entradaAte: evento.inicio })
  const linhas = await db.presencaEventoEspecial.findMany({
    where: { clubeId, eventoId: evento.id },
    select: { dbvId: true, foi: true, comUniforme: true },
  })
  return { roster, marcas: new Map(linhas.map((linha) => [linha.dbvId, { foi: linha.foi, comUniforme: linha.comUniforme }])) }
}

/** Nome de cada id que existe no clube; ids de outro clube ou desconhecidos ficam de fora. */
async function nomesDoClube(db: Tx, clubeId: string, ids: string[]): Promise<Map<string, string>> {
  const fichas = await db.desbravador.findMany({ where: { clubeId, id: { in: ids } }, select: { id: true, nome: true } })
  return new Map(fichas.map((ficha) => [ficha.id, ficha.nome]))
}

function mudou(antes: Marca | undefined, depois: Marca | undefined): boolean {
  return !antes || !depois || antes.foi !== depois.foi || antes.comUniforme !== depois.comUniforme
}

/** Nunca apaga: desmarcar grava `foi=false` e `comUniforme=false`. */
async function gravarMarca(tx: Tx, clubeId: string, eventoId: string, dbvId: string, marca: Marca, usuarioId: string): Promise<void> {
  const { foi, comUniforme } = marca
  await tx.presencaEventoEspecial.upsert({
    where: { eventoId_dbvId: { eventoId, dbvId }, clubeId },
    create: { clubeId, eventoId, dbvId, foi, comUniforme, alteradaPorId: usuarioId },
    update: { foi, comUniforme, alteradaPorId: usuarioId, alteradaEm: new Date() },
  })
}

function linhaDe(ficha: FichaDoRoster, marca: Marca | undefined): Linha {
  const { foi, comUniforme } = marca ?? SEM_MARCA
  return { dbvId: ficha.id, nome: ficha.nome, foi, comUniforme }
}

function resumoDe(situacao: Situacao): Resumo {
  let foram = 0
  let uniformizados = 0
  for (const ficha of situacao.roster) {
    const marca = situacao.marcas.get(ficha.id)
    if (marca?.foi) foram++
    if (marca?.foi && marca.comUniforme) uniformizados++
  }
  return { foram, uniformizados, total: situacao.roster.length }
}

/** Unidades em ordem alfabética, "Sem unidade" por último; dentro de cada uma, os nomes em ordem. */
function agruparPorUnidade(situacao: Situacao): Lista['unidades'] {
  const grupos = new Map<string | null, Lista['unidades'][number]>()
  for (const ficha of situacao.roster) {
    const chave = ficha.unidade?.id ?? null
    const grupo = grupos.get(chave) ?? { unidadeId: chave, nome: ficha.unidade?.nome ?? SEM_UNIDADE, linhas: [] }
    grupo.linhas.push(linhaDe(ficha, situacao.marcas.get(ficha.id)))
    grupos.set(chave, grupo)
  }
  const unidades = [...grupos.values()]
  for (const unidade of unidades) unidade.linhas.sort((a, b) => colador.compare(a.nome, b.nome))
  return unidades.sort((a, b) => {
    if (a.unidadeId === null || b.unidadeId === null) return a.unidadeId === b.unidadeId ? 0 : a.unidadeId === null ? 1 : -1
    return colador.compare(a.nome, b.nome)
  })
}

function avisoDeFora(nome: string): string {
  return `${nome} não está na lista deste evento (já não está no ranking do mês ou entrou depois do dia). A marca ficou guardada e não conta.`
}

/** Quem foi marcado e já não está no roster: a linha fica guardada, vira aviso e não entra na conta. */
async function avisosDeQuemSaiu(tx: Tx, clubeId: string, situacao: Situacao): Promise<string[]> {
  const noRoster = new Set(situacao.roster.map((ficha) => ficha.id))
  const fora = [...situacao.marcas].filter(([dbvId, marca]) => marca.foi && !noRoster.has(dbvId)).map(([dbvId]) => dbvId)
  if (fora.length === 0) return []
  const nomes = await nomesDoClube(tx, clubeId, fora)
  return [...nomes.values()].sort((a, b) => colador.compare(a, b)).map(avisoDeFora)
}

function situacaoEmTexto(marca: Marca | undefined): string {
  if (!marca?.foi) return 'não foi'
  return marca.comUniforme ? 'foi com o uniforme' : 'foi'
}
