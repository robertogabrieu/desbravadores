import { Injectable } from '@nestjs/common'
import { paraDataCivil } from '../desbravadores/apoio'
import type { EventoCalendario, Prisma } from '../generated/prisma/client.js'
import { ServicoPontos, type PontoDevido } from '../pontos/servico-pontos'
import { rosterDoMes } from '../ranking/calculo-ranking'
import { garantirCriteriosDeEvento } from './criterios'
import { travarPresencaDoEvento } from './travas'

/** O que dos pontos o evento decide: o dia (e portanto o mês do ranking) e o valor de cada coisa. */
export type EventoDePontos = Pick<EventoCalendario, 'id' | 'inicio' | 'pontosParticipacao' | 'pontosUniforme'>

export interface CriteriosDoEvento {
  participacaoId: string
  uniformeId: string
}

export interface EntradaSincronizarPessoa {
  clubeId: string
  evento: EventoDePontos
  dbvId: string
  foi: boolean
  comUniforme: boolean
  lancadoPorId: string
  /** Quem sincroniza várias pessoas lê os critérios uma vez (`criterios`) e os passa adiante. */
  criterios?: CriteriosDoEvento
}

export interface EntradaDoEventoInteiro {
  clubeId: string
  evento: EventoDePontos
  lancadoPorId: string
}

export interface EntradaEstornarEvento {
  clubeId: string
  eventoId: string
  lancadoPorId: string
}

/**
 * Pontos do evento especial: participação para quem foi e uniforme para quem foi com o uniforme, com o valor do
 * evento, uma vez só, no dia de início. Toda escrita passa por `ServicoPontos.sincronizar`. Quem falta não perde
 * ponto, e valor 0 não gera lançamento. Todos os métodos rodam na transação de quem chama e leem só por ela.
 */
@Injectable()
export class ServicoPontosEvento {
  constructor(private readonly pontos: ServicoPontos) {}

  /** Garante os dois critérios (a última trava da ordem) e devolve os ids. */
  async criterios(tx: Prisma.TransactionClient, clubeId: string): Promise<CriteriosDoEvento> {
    await garantirCriteriosDeEvento(tx, clubeId)
    const criterios = await tx.criterioRanking.findMany({
      where: { clubeId, padrao: true, gatilho: { in: ['EVENTO_ESPECIAL_PARTICIPACAO', 'EVENTO_ESPECIAL_UNIFORME'] } },
      select: { id: true, gatilho: true },
    })
    const participacao = criterios.find((criterio) => criterio.gatilho === 'EVENTO_ESPECIAL_PARTICIPACAO')
    const uniforme = criterios.find((criterio) => criterio.gatilho === 'EVENTO_ESPECIAL_UNIFORME')
    if (!participacao || !uniforme) throw new Error('Critérios do evento especial não encontrados')
    return { participacaoId: participacao.id, uniformeId: uniforme.id }
  }

  /** Acerta os lançamentos de uma pessoa com a marca dela: o que deixou de ser devido é estornado, o novo nasce. */
  async sincronizar(tx: Prisma.TransactionClient, entrada: EntradaSincronizarPessoa): Promise<void> {
    const { clubeId, evento, dbvId } = entrada
    const criterios = entrada.criterios ?? (await this.criterios(tx, clubeId))
    await this.pontos.sincronizar(tx, {
      clubeId,
      dbvId,
      origemTipo: 'EVENTO_ESPECIAL',
      origemId: origemDoPonto(evento.id, dbvId),
      data: paraDataCivil(evento.inicio),
      devidos: devidosDe(evento, criterios, entrada.foi, entrada.comUniforme),
      lancadoPorId: entrada.lancadoPorId,
    })
  }

  /**
   * Estorna tudo do evento e lança de novo, pelos valores e pelo dia que `evento` traz, só para quem foi e está no
   * ranking do mês dele. Devolve quantas pessoas foram relançadas. Vale quando o valor ou a data do evento mudam.
   */
  async refazer(tx: Prisma.TransactionClient, entrada: EntradaDoEventoInteiro): Promise<number> {
    const { clubeId, evento, lancadoPorId } = entrada
    await this.estornar(tx, { clubeId, eventoId: evento.id, lancadoPorId })
    const criterios = await this.criterios(tx, clubeId)
    const roster = await rosterDoMes(tx, clubeId, paraDataCivil(evento.inicio).slice(0, 7), { entradaAte: evento.inicio })
    const marcas = await tx.presencaEventoEspecial.findMany({
      where: { clubeId, eventoId: evento.id, foi: true, dbvId: { in: roster.map((ficha) => ficha.id) } },
      select: { dbvId: true, comUniforme: true },
    })
    for (const marca of marcas) {
      await this.sincronizar(tx, { clubeId, evento, dbvId: marca.dbvId, foi: true, comUniforme: marca.comUniforme, lancadoPorId, criterios })
    }
    return marcas.length
  }

  /** Tira do ranking todos os pontos do evento (os lançamentos ficam guardados, estornados). Devolve quantas pessoas perderam pontos. */
  async estornar(tx: Prisma.TransactionClient, entrada: EntradaEstornarEvento): Promise<number> {
    const { clubeId, eventoId, lancadoPorId } = entrada
    await travarPresencaDoEvento(tx, eventoId)
    const ativos = await tx.lancamentoPontos.findMany({
      where: { clubeId, origemTipo: 'EVENTO_ESPECIAL', origemId: { startsWith: `${eventoId}:` }, estornadoEm: null },
      select: { dbvId: true, data: true },
    })
    const porPessoa = new Map(ativos.map((lancamento) => [lancamento.dbvId, lancamento.data]))
    for (const [dbvId, data] of porPessoa) {
      await this.pontos.sincronizar(tx, {
        clubeId,
        dbvId,
        origemTipo: 'EVENTO_ESPECIAL',
        origemId: origemDoPonto(eventoId, dbvId),
        data: paraDataCivil(data),
        devidos: [],
        lancadoPorId,
      })
    }
    return porPessoa.size
  }
}

function origemDoPonto(eventoId: string, dbvId: string): string {
  return `${eventoId}:${dbvId}`
}

function devidosDe(evento: EventoDePontos, criterios: CriteriosDoEvento, foi: boolean, comUniforme: boolean): PontoDevido[] {
  if (!foi) return []
  const devidos: PontoDevido[] = []
  const participacao = evento.pontosParticipacao ?? 0
  const uniforme = evento.pontosUniforme ?? 0
  if (participacao > 0) devidos.push({ criterioId: criterios.participacaoId, pontos: participacao })
  if (comUniforme && uniforme > 0) devidos.push({ criterioId: criterios.uniformeId, pontos: uniforme })
  return devidos
}
