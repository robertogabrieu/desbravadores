import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { ARMAZENAMENTO, type Armazenamento } from '../arquivos/armazenamento'
import { PrismaService } from '../comum/prisma/prisma.service'

const TAMANHO_DO_LOTE = 100

/**
 * Garante a remocao de verdade (SPEC Fase 1, E17): se a API caiu ou o disco falhou depois de
 * marcar a foto como removida, na subida os arquivos que sobraram sao apagados. Remover o que
 * ja nao existe e inofensivo, entao nao ha o que conferir antes.
 */
@Injectable()
export class LimpezaDeFotos implements OnApplicationBootstrap {
  private readonly logger = new Logger(LimpezaDeFotos.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.limpar()
    } catch (erro) {
      this.logger.error(`Limpeza de fotos removidas falhou: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }

  async limpar(): Promise<void> {
    const clubes = await this.prisma.clube.findMany({ select: { id: true } })
    for (const { id: clubeId } of clubes) await this.limparClube(clubeId)
  }

  private async limparClube(clubeId: string): Promise<void> {
    let ultimoId: string | undefined
    for (;;) {
      const lote = await this.prisma.foto.findMany({
        where: { clubeId, removidaEm: { not: null } },
        orderBy: { id: 'asc' },
        take: TAMANHO_DO_LOTE,
        ...(ultimoId ? { cursor: { id: ultimoId }, skip: 1 } : {}),
        select: { id: true, arquivo: { select: { caminho: true, miniaturaCaminho: true } } },
      })
      for (const foto of lote) {
        for (const caminho of [foto.arquivo.caminho, foto.arquivo.miniaturaCaminho]) {
          if (caminho) await this.apagar(caminho)
        }
      }
      if (lote.length < TAMANHO_DO_LOTE) return
      ultimoId = lote[lote.length - 1]?.id
    }
  }

  private async apagar(caminho: string): Promise<void> {
    try {
      await this.armazenamento.remover(caminho)
    } catch (erro) {
      this.logger.error(`Nao foi possivel apagar ${caminho}: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }
}
