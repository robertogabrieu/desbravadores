import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { ARMAZENAMENTO, type Armazenamento } from '../arquivos/armazenamento'
import { PrismaService } from '../comum/prisma/prisma.service'

const TAMANHO_DO_LOTE = 100

/**
 * Garante a remoção de verdade (SPEC Fase 2, F9): se a API caiu ou o disco falhou depois de
 * marcar o material, ou o item da biblioteca, como removido, na subida os arquivos que sobraram
 * são apagados. Remover o que já não existe é inofensivo, então não há o que conferir antes.
 */
@Injectable()
export class LimpezaDeMateriais implements OnApplicationBootstrap {
  private readonly logger = new Logger(LimpezaDeMateriais.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.limpar()
    } catch (erro) {
      this.logger.error(`Limpeza de materiais removidos falhou: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }

  async limpar(): Promise<void> {
    const clubes = await this.prisma.clube.findMany({ select: { id: true } })
    for (const { id: clubeId } of clubes) {
      await this.limparMateriais(clubeId)
      await this.limparBiblioteca(clubeId)
    }
  }

  private async limparMateriais(clubeId: string): Promise<void> {
    let ultimoId: string | undefined
    for (;;) {
      const lote = await this.prisma.material.findMany({
        where: { clubeId, removidoEm: { not: null }, arquivoId: { not: null } },
        orderBy: { id: 'asc' },
        take: TAMANHO_DO_LOTE,
        ...(ultimoId ? { cursor: { id: ultimoId }, skip: 1 } : {}),
        select: { id: true, arquivo: { select: { caminho: true } } },
      })
      for (const material of lote) {
        if (material.arquivo) await this.apagar(material.arquivo.caminho)
      }
      if (lote.length < TAMANHO_DO_LOTE) return
      ultimoId = lote[lote.length - 1]?.id
    }
  }

  private async limparBiblioteca(clubeId: string): Promise<void> {
    let ultimoId: string | undefined
    for (;;) {
      const lote = await this.prisma.itemBiblioteca.findMany({
        where: { clubeId, removidoEm: { not: null } },
        orderBy: { id: 'asc' },
        take: TAMANHO_DO_LOTE,
        ...(ultimoId ? { cursor: { id: ultimoId }, skip: 1 } : {}),
        select: {
          id: true,
          arquivo: { select: { caminho: true } },
          capa: { select: { caminho: true, miniaturaCaminho: true } },
        },
      })
      for (const item of lote) {
        await this.apagar(item.arquivo.caminho)
        if (item.capa) await this.apagar(item.capa.caminho)
        if (item.capa?.miniaturaCaminho) await this.apagar(item.capa.miniaturaCaminho)
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
