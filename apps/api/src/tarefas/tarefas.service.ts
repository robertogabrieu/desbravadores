import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'
import { ServicoTipoDaFicha } from '../desbravadores/tipo-da-ficha.service'

const SEIS_HORAS_MS = 6 * 60 * 60 * 1000

/**
 * Varredura do Tipo em todos os clubes, ao subir e a cada 6 horas: leva a virada de ano (os novos 16)
 * à Diretoria. Só liga com `TAREFAS_PERIODICAS=1`. O client sem guarda só lista os clubes; o resto roda
 * pelo client com guarda, clube a clube.
 */
@Injectable()
export class TarefasPeriodicas implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TarefasPeriodicas.name)
  private intervalo: NodeJS.Timeout | undefined
  /** Trava do processo: a varredura em andamento é devolvida a quem pedir outra. */
  private emAndamento: Promise<void> | undefined

  constructor(
    private readonly sistema: PrismaSistema,
    private readonly tipo: ServicoTipoDaFicha,
  ) {}

  onModuleInit(): void {
    if (process.env['TAREFAS_PERIODICAS'] !== '1') return
    const rodar = (): void => {
      this.sincronizarTodos().catch((erro: unknown) => this.logger.error(`Varredura do Tipo falhou: ${String(erro)}`))
    }
    rodar()
    this.intervalo = setInterval(rodar, SEIS_HORAS_MS)
    this.intervalo.unref()
  }

  onModuleDestroy(): void {
    clearInterval(this.intervalo)
    this.intervalo = undefined
  }

  /** `hoje` fixa a data civil (teste da virada de ano); sem ela, vale o "hoje" no fuso de cada clube. */
  sincronizarTodos(hoje?: string): Promise<void> {
    this.emAndamento ??= this.varrer(hoje).finally(() => {
      this.emAndamento = undefined
    })
    return this.emAndamento
  }

  private async varrer(hoje: string | undefined): Promise<void> {
    const clubes = await this.sistema.clube.findMany({ select: { id: true } })
    for (const clube of clubes) {
      try {
        const mudaram = await this.tipo.sincronizarClube(clube.id, hoje)
        if (mudaram > 0) this.logger.log(`Clube ${clube.id}: ${mudaram} ficha(s) com o Tipo recalculado.`)
      } catch (erro) {
        this.logger.error(`Clube ${clube.id}: varredura do Tipo falhou: ${erro instanceof Error ? erro.message : String(erro)}`)
      }
    }
  }
}
