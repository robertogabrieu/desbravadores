import { Body, Controller, Get, HttpCode, Param, Post, Patch, Put, Query } from '@nestjs/common'
import {
  DesbravadorCriarEntrada,
  DesbravadorEditarEntrada,
  DesbravadorFiltro,
  InativarEntrada,
  MatriculaEntrada,
  MoverUnidadeEntrada,
  Uuid,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { DesbravadoresService } from './desbravadores.service'

const IdDaRota = new ZodValidationPipe(Uuid)

@Controller('desbravadores')
export class DesbravadoresController {
  constructor(private readonly desbravadores: DesbravadoresService) {}

  @Pode('dbv.ver')
  @Get()
  listar(@SessaoDoClube() sessao: SessaoLogada, @Query(new ZodValidationPipe(DesbravadorFiltro)) filtro: z.infer<typeof DesbravadorFiltro>) {
    return this.desbravadores.listar(sessao, filtro)
  }

  @Pode('dbv.ver')
  @Get(':id')
  obter(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.desbravadores.obter(sessao, id)
  }

  @Pode('dbv.cadastrar')
  @Post()
  criar(@SessaoDoClube() sessao: SessaoLogada, @Body(new ZodValidationPipe(DesbravadorCriarEntrada)) entrada: z.infer<typeof DesbravadorCriarEntrada>) {
    return this.desbravadores.criar(sessao, entrada)
  }

  @Pode('dbv.editar')
  @Patch(':id')
  editar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(DesbravadorEditarEntrada)) entrada: z.infer<typeof DesbravadorEditarEntrada>,
  ) {
    return this.desbravadores.editar(sessao, id, entrada)
  }

  @Pode('dbv.cadastrar')
  @HttpCode(200)
  @Post(':id/inativar')
  inativar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(InativarEntrada)) entrada: z.infer<typeof InativarEntrada>,
  ) {
    return this.desbravadores.inativar(sessao, id, entrada)
  }

  @Pode('dbv.cadastrar')
  @HttpCode(200)
  @Post(':id/reativar')
  reativar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.desbravadores.reativar(sessao, id)
  }

  @Pode('unidade.gerenciar')
  @Put(':id/unidade')
  moverUnidade(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(MoverUnidadeEntrada)) entrada: z.infer<typeof MoverUnidadeEntrada>,
  ) {
    return this.desbravadores.moverUnidade(sessao, id, entrada)
  }

  @Pode('classe.gerenciar')
  @Post(':id/matriculas')
  matricular(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(MatriculaEntrada)) entrada: z.infer<typeof MatriculaEntrada>,
  ) {
    return this.desbravadores.matricularEmClasse(sessao, id, entrada)
  }
}
