import { rm } from 'node:fs/promises'
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { PedidoSaida } from '@desbravadores/shared'
import { ARMAZENAMENTO, type Armazenamento } from '../arquivos/armazenamento'
import { gravarEConfirmar } from '../arquivos/gravar-e-confirmar'
import { caminhoDoComprovante } from '../arquivos/servico-arquivos'
import { ErroApp } from '../comum/erros'
import { gerarUuidV7 } from '../comum/uuid-v7'
import { PrismaService } from '../comum/prisma/prisma.service'
import type { PedidoVenda, Prisma } from '../generated/prisma/client.js'
import type { ArquivoEmDisco } from '../materiais/materiais.service'
import { exigirVendaAberta } from './constantes'
import { formatoDoComprovante } from './conferencia-de-comprovante'
import { exigirNaoCancelado, pedidoDaVenda, PedidosService } from './pedidos.service'
import { VendasService } from './vendas.service'

const FORMATO_INVALIDO = 'Envie uma foto (JPEG, PNG ou WebP) ou um PDF.'
const SEM_PAGAMENTO = 'O comprovante só vale em pedido pago. Marque o pedido como pago primeiro.'

/** Comprovante de pagamento do pedido: um por pedido, trocado ou removido só enquanto a venda está aberta. */
@Injectable()
export class ComprovanteService {
  private readonly logger = new Logger(ComprovanteService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly vendas: VendasService,
    private readonly pedidos: PedidosService,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
  ) {}

  /** O temporário do multer some em qualquer desfecho: movido para o destino ou apagado no `finally`. */
  async enviar(clubeId: string, usuarioId: string, vendaId: string, pedidoId: string, arquivo: ArquivoEmDisco | undefined): Promise<PedidoSaida> {
    if (!arquivo) throw new ErroApp('VALIDACAO', 'Confira os campos informados.', { arquivo: 'Envie o comprovante.' })
    try {
      await this.gravar(clubeId, usuarioId, vendaId, pedidoId, arquivo)
    } finally {
      await rm(arquivo.path, { force: true })
    }
    return this.pedidos.obter(clubeId, vendaId, pedidoId)
  }

  async remover(clubeId: string, vendaId: string, pedidoId: string): Promise<PedidoSaida> {
    const antigo = await this.vendas.escrever(clubeId, vendaId, async (tx, venda) => {
      exigirVendaAberta(venda)
      const pedido = await pedidoVisivel(tx, clubeId, vendaId, pedidoId)
      return pedido.comprovanteId ? trocarComprovante(tx, clubeId, pedido, null) : null
    })
    await this.apagarDoDisco(antigo)
    return this.pedidos.obter(clubeId, vendaId, pedidoId)
  }

  private async gravar(clubeId: string, usuarioId: string, vendaId: string, pedidoId: string, arquivo: ArquivoEmDisco): Promise<void> {
    const formato = await formatoDoComprovante(arquivo.path)
    if (!formato) throw new ErroApp('REGRA', FORMATO_INVALIDO)
    const arquivoId = gerarUuidV7()
    const destino = caminhoDoComprovante(clubeId, arquivoId, formato.ext)

    const antigo = await gravarEConfirmar(
      this.armazenamento,
      [{ caminho: destino, origem: arquivo.path }],
      () =>
        this.vendas.escrever(
          clubeId,
          vendaId,
          async (tx, venda) => {
            exigirVendaAberta(venda)
            const pedido = await pedidoVisivel(tx, clubeId, vendaId, pedidoId)
            await tx.arquivo.create({
              data: { id: arquivoId, clubeId, caminho: destino, mime: formato.mime, bytes: arquivo.size, criadoPorId: usuarioId },
              select: { id: true },
            })
            return trocarComprovante(tx, clubeId, pedido, arquivoId)
          },
        ),
      (caminho) => this.armazenamento.remover(caminho),
    )
    await this.apagarDoDisco(antigo)
  }

  /** O arquivo já saiu do banco; se o disco falhar, sobra um arquivo solto, nunca uma linha sem arquivo. */
  private async apagarDoDisco(caminho: string | null): Promise<void> {
    if (!caminho) return
    try {
      await this.armazenamento.remover(caminho)
    } catch (erro) {
      this.logger.warn(`Comprovante substituído não foi apagado do disco: ${caminho} (${erro instanceof Error ? erro.message : 'erro'})`)
    }
  }
}

/** Pedido da venda, não cancelado e pago: só assim o comprovante aparece e se edita. */
async function pedidoVisivel(tx: Prisma.TransactionClient, clubeId: string, vendaId: string, pedidoId: string): Promise<PedidoVenda> {
  const pedido = await pedidoDaVenda(tx, clubeId, vendaId, pedidoId)
  exigirNaoCancelado(pedido)
  if (!pedido.pago) throw new ErroApp('CONFLITO', SEM_PAGAMENTO)
  return pedido
}

/** Aponta o pedido para o novo arquivo (ou para nenhum), apaga a linha do antigo e devolve o caminho dele para sair do disco. */
async function trocarComprovante(tx: Prisma.TransactionClient, clubeId: string, pedido: PedidoVenda, novoId: string | null): Promise<string | null> {
  await tx.pedidoVenda.updateMany({ where: { clubeId, id: pedido.id }, data: { comprovanteId: novoId } })
  if (!pedido.comprovanteId) return null
  const antigo = await tx.arquivo.findFirst({ where: { clubeId, id: pedido.comprovanteId }, select: { caminho: true } })
  await tx.arquivo.deleteMany({ where: { clubeId, id: pedido.comprovanteId } })
  return antigo?.caminho ?? null
}
