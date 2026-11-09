import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { Uuid, VendaEntrada } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { VendasService } from './vendas.service'

const IdDaRota = new ZodValidationPipe(Uuid)
const CorpoDaVenda = new ZodValidationPipe(VendaEntrada)

@Controller('vendas')
export class VendasController {
  constructor(private readonly vendas: VendasService) {}

  @Pode('venda.gerenciar')
  @Get()
  listar(@SessaoDoClube() sessao: SessaoLogada) {
    return this.vendas.listar(sessao.clubeId)
  }

  @Pode('venda.gerenciar')
  @Post()
  criar(@SessaoDoClube() sessao: SessaoLogada, @Body(CorpoDaVenda) entrada: z.output<typeof VendaEntrada>) {
    return this.vendas.criar(sessao.clubeId, entrada)
  }

  @Pode('venda.gerenciar')
  @Get(':id')
  obter(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.vendas.obter(sessao.clubeId, id)
  }

  @Pode('venda.gerenciar')
  @Patch(':id')
  atualizar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(CorpoDaVenda) entrada: z.output<typeof VendaEntrada>,
  ) {
    return this.vendas.atualizar(sessao.clubeId, id, entrada)
  }

  @Pode('venda.gerenciar')
  @Post(':id/encerrar')
  encerrar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.vendas.encerrar(sessao.clubeId, id)
  }

  @Pode('venda.gerenciar')
  @Post(':id/reabrir')
  reabrir(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.vendas.reabrir(sessao.clubeId, id)
  }
}
