import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  LIMITE_BYTES_COMPROVANTE,
  MENSAGEM_COMPROVANTE_GRANDE,
  PagarPedidoEntrada,
  PedidoEdicao,
  PedidoEntrada,
  PedidosQuery,
  Uuid,
} from '@desbravadores/shared'
import { diskStorage } from 'multer'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { FiltroArquivoGrande } from '../materiais/filtro-arquivo-grande'
import type { ArquivoEmDisco } from '../materiais/materiais.service'
import { ComprovanteService } from './comprovante.service'
import { PainelService } from './painel.service'
import { PedidosService } from './pedidos.service'

const IdDaRota = new ZodValidationPipe(Uuid)

export const PASTA_TEMPORARIA_DE_COMPROVANTES = join(tmpdir(), 'desbravadores-comprovantes')

const ARMAZENAMENTO_TEMPORARIO = diskStorage({
  destination: (_requisicao, _arquivo, concluir) => {
    mkdirSync(PASTA_TEMPORARIA_DE_COMPROVANTES, { recursive: true })
    concluir(null, PASTA_TEMPORARIA_DE_COMPROVANTES)
  },
})

@Controller('vendas/:id')
export class PedidosController {
  constructor(
    private readonly pedidos: PedidosService,
    private readonly painel: PainelService,
    private readonly comprovante: ComprovanteService,
  ) {}

  @Pode('venda.gerenciar')
  @Get('painel')
  obterPainel(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.painel.obter(sessao.clubeId, id)
  }

  @Pode('venda.gerenciar')
  @Get('pedidos')
  listar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Query(new ZodValidationPipe(PedidosQuery)) consulta: z.output<typeof PedidosQuery>,
  ) {
    return this.pedidos.listar(sessao.clubeId, id, consulta)
  }

  @Pode('venda.gerenciar')
  @Post('pedidos')
  lancar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(PedidoEntrada)) entrada: z.output<typeof PedidoEntrada>,
  ) {
    return this.pedidos.lancar(sessao.clubeId, id, entrada)
  }

  @Pode('venda.gerenciar')
  @Get('pedidos/:pedidoId')
  obter(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string, @Param('pedidoId', IdDaRota) pedidoId: string) {
    return this.pedidos.obter(sessao.clubeId, id, pedidoId)
  }

  @Pode('venda.gerenciar')
  @Patch('pedidos/:pedidoId')
  editar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Param('pedidoId', IdDaRota) pedidoId: string,
    @Body(new ZodValidationPipe(PedidoEdicao)) entrada: z.output<typeof PedidoEdicao>,
  ) {
    return this.pedidos.editar(sessao.clubeId, id, pedidoId, entrada)
  }

  @Pode('venda.gerenciar')
  @Post('pedidos/:pedidoId/pagar')
  pagar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Param('pedidoId', IdDaRota) pedidoId: string,
    @Body(new ZodValidationPipe(PagarPedidoEntrada)) entrada: z.output<typeof PagarPedidoEntrada>,
  ) {
    return this.pedidos.pagar(sessao.clubeId, id, pedidoId, entrada)
  }

  @Pode('venda.gerenciar')
  @Post('pedidos/:pedidoId/despagar')
  despagar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string, @Param('pedidoId', IdDaRota) pedidoId: string) {
    return this.pedidos.despagar(sessao.clubeId, id, pedidoId)
  }

  @Pode('venda.gerenciar')
  @Post('pedidos/:pedidoId/entregar')
  entregar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string, @Param('pedidoId', IdDaRota) pedidoId: string) {
    return this.pedidos.entregar(sessao.clubeId, id, pedidoId)
  }

  @Pode('venda.gerenciar')
  @Post('pedidos/:pedidoId/desentregar')
  desentregar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string, @Param('pedidoId', IdDaRota) pedidoId: string) {
    return this.pedidos.desentregar(sessao.clubeId, id, pedidoId)
  }

  @Pode('venda.gerenciar')
  @Post('pedidos/:pedidoId/cancelar')
  cancelar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string, @Param('pedidoId', IdDaRota) pedidoId: string) {
    return this.pedidos.cancelar(sessao.clubeId, id, pedidoId)
  }

  @Pode('venda.gerenciar')
  @Post('pedidos/:pedidoId/reativar')
  reativar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string, @Param('pedidoId', IdDaRota) pedidoId: string) {
    return this.pedidos.reativar(sessao.clubeId, id, pedidoId)
  }

  /** Foto ou PDF; enviar de novo troca o comprovante. */
  @Pode('venda.gerenciar')
  @Post('pedidos/:pedidoId/comprovante')
  @UseFilters(new FiltroArquivoGrande(MENSAGEM_COMPROVANTE_GRANDE))
  @UseInterceptors(FileInterceptor('arquivo', { storage: ARMAZENAMENTO_TEMPORARIO, limits: { fileSize: LIMITE_BYTES_COMPROVANTE, files: 1 } }))
  enviarComprovante(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Param('pedidoId', IdDaRota) pedidoId: string,
    @UploadedFile() arquivo: ArquivoEmDisco | undefined,
  ) {
    return this.comprovante.enviar(sessao.clubeId, sessao.usuarioId, id, pedidoId, arquivo)
  }

  @Pode('venda.gerenciar')
  @Delete('pedidos/:pedidoId/comprovante')
  removerComprovante(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string, @Param('pedidoId', IdDaRota) pedidoId: string) {
    return this.comprovante.remover(sessao.clubeId, id, pedidoId)
  }
}
