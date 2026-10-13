import { Injectable } from '@nestjs/common'
import type { Prisma, OrigemPontos } from '../generated/prisma/client.js'
import { daDataCivil } from '../desbravadores/apoio'

/** Um lancamento que continua devido. */
export interface PontoDevido {
  criterioId: string
  pontos: number
}

export interface EntradaSincronizar {
  clubeId: string
  dbvId: string
  origemTipo: OrigemPontos
  origemId: string
  data: string
  devidos: PontoDevido[]
  /**
   * Criterios que o desbravador conquistou na marcacao mas cuja regra esta desligada: quem ja tem
   * lancamento ativo por eles o mantem (valor da epoca); nenhum novo e criado.
   */
  conquistadosDesligados?: string[]
  lancadoPorId: string
}

/**
 * Unica escrita em `LancamentoPontos` (SPEC Fase 1, 5.3 e E8). Compara os lancamentos ativos da
 * origem com o que e devido, por criterio: igual nao e tocado (mantem o valor da epoca), o que
 * deixou de ser devido e estornado e o novo nasce com o valor recebido. Ponto negativo e recusado:
 * a regra de produto e so acrescentar.
 */
@Injectable()
export class ServicoPontos {
  async sincronizar(tx: Prisma.TransactionClient, entrada: EntradaSincronizar): Promise<void> {
    const { clubeId, dbvId, origemTipo, origemId } = entrada
    if (entrada.devidos.some((devido) => devido.pontos < 0)) {
      throw new Error('Pontos negativos não são lançados: a pontuação só acrescenta.')
    }
    const ativos = await tx.lancamentoPontos.findMany({
      where: { clubeId, origemTipo, origemId, estornadoEm: null },
      select: { id: true, criterioId: true },
    })
    const devidos = new Map(entrada.devidos.map((devido) => [devido.criterioId, devido.pontos]))
    const mantidos = new Set(entrada.conquistadosDesligados ?? [])
    const jaLancados = new Set(ativos.map((lancamento) => lancamento.criterioId))

    // Lancamento sem criterio (desconto por falta de antes) nunca e devido: e estornado.
    const continuaValendo = (criterioId: string | null): boolean =>
      criterioId !== null && (devidos.has(criterioId) || mantidos.has(criterioId))
    const aEstornar = ativos.filter((lancamento) => !continuaValendo(lancamento.criterioId)).map((lancamento) => lancamento.id)
    if (aEstornar.length > 0) {
      await tx.lancamentoPontos.updateMany({
        where: { clubeId, id: { in: aEstornar } },
        data: { estornadoEm: new Date() },
      })
    }

    const novos = [...devidos].filter(([criterioId]) => !jaLancados.has(criterioId))
    if (novos.length > 0) {
      await tx.lancamentoPontos.createMany({
        data: novos.map(([criterioId, pontos]) => ({
          clubeId,
          dbvId,
          criterioId,
          pontos,
          data: daDataCivil(entrada.data),
          origemTipo,
          origemId,
          lancadoPorId: entrada.lancadoPorId,
        })),
      })
    }
  }
}
