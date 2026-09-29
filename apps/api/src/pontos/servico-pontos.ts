import { Injectable } from '@nestjs/common'
import type { Prisma, OrigemPontos } from '../generated/prisma/client.js'
import { daDataCivil } from '../desbravadores/apoio'

/** Um lancamento que continua devido: `criterioId` nulo e o desconto por falta. */
export interface PontoDevido {
  criterioId: string | null
  pontos: number
}

export interface EntradaSincronizar {
  clubeId: string
  dbvId: string
  origemTipo: OrigemPontos
  origemId: string
  data: string
  devidos: PontoDevido[]
  lancadoPorId: string
}

/**
 * Unica escrita em `LancamentoPontos` (SPEC Fase 1, 5.3 e E8). Compara os lancamentos ativos da
 * origem com o que e devido, por criterio: igual nao e tocado (mantem o valor da epoca), o que
 * deixou de ser devido e estornado e o novo nasce com o valor recebido.
 */
@Injectable()
export class ServicoPontos {
  async sincronizar(tx: Prisma.TransactionClient, entrada: EntradaSincronizar): Promise<void> {
    const { clubeId, dbvId, origemTipo, origemId } = entrada
    const ativos = await tx.lancamentoPontos.findMany({
      where: { clubeId, origemTipo, origemId, estornadoEm: null },
      select: { id: true, criterioId: true },
    })
    const devidos = new Map(entrada.devidos.map((devido) => [devido.criterioId, devido.pontos]))
    const jaLancados = new Set(ativos.map((lancamento) => lancamento.criterioId))

    const aEstornar = ativos.filter((lancamento) => !devidos.has(lancamento.criterioId)).map((lancamento) => lancamento.id)
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
