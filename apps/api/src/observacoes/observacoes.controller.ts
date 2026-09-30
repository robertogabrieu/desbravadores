import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import { ObservacaoEditarEntrada, ObservacaoEntrada, ObservacaoFiltro, Uuid } from '@desbravadores/shared'
import type { z } from 'zod'
import { Logado } from '../comum/decorators/logado.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ObservacoesService } from './observacoes.service'

const IdDaRota = new ZodValidationPipe(Uuid)

@Controller('observacoes')
export class ObservacoesController {
  constructor(private readonly observacoes: ObservacoesService) {}

  @Logado()
  @Get()
  listar(@SessaoDoClube() sessao: SessaoLogada, @Query(new ZodValidationPipe(ObservacaoFiltro)) filtro: z.infer<typeof ObservacaoFiltro>) {
    return this.observacoes.listar(sessao, filtro)
  }

  @Logado()
  @Post()
  criar(@SessaoDoClube() sessao: SessaoLogada, @Body(new ZodValidationPipe(ObservacaoEntrada)) entrada: z.infer<typeof ObservacaoEntrada>) {
    return this.observacoes.criar(sessao, entrada)
  }

  @Logado()
  @Patch(':id')
  editar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(ObservacaoEditarEntrada)) entrada: z.infer<typeof ObservacaoEditarEntrada>,
  ) {
    return this.observacoes.editar(sessao, id, entrada)
  }

  @Logado()
  @Delete(':id')
  @HttpCode(204)
  apagar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.observacoes.apagar(sessao, id)
  }
}
