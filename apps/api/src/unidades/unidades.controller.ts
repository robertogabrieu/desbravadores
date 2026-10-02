import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { GradeFrequenciaFiltro, UnidadeCriarEntrada, UnidadeEditarEntrada, UnidadeFiltro, Uuid } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { UnidadesService } from './unidades.service'

const IdDaRota = new ZodValidationPipe(Uuid)

@Controller('unidades')
export class UnidadesController {
  constructor(private readonly unidades: UnidadesService) {}

  @Pode('dbv.ver')
  @Get()
  listar(@SessaoDoClube() sessao: SessaoLogada, @Query(new ZodValidationPipe(UnidadeFiltro)) filtro: z.infer<typeof UnidadeFiltro>) {
    return this.unidades.listar(sessao, filtro)
  }

  // Rota literal antes das paramétricas: senão `:id` engoliria "sem-membros".
  @Pode('unidade.gerenciar')
  @Get('sem-membros')
  semMembros(@SessaoDoClube() sessao: SessaoLogada) {
    return this.unidades.semMembros(sessao)
  }

  @Pode('dbv.ver')
  @Get(':id')
  obter(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.unidades.obter(sessao, id)
  }

  @Pode('dbv.ver')
  @Get(':id/membros')
  membros(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.unidades.membros(sessao, id)
  }

  @Pode('reuniao.ver')
  @Get(':id/frequencia')
  frequencia(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Query(new ZodValidationPipe(GradeFrequenciaFiltro)) filtro: z.infer<typeof GradeFrequenciaFiltro>,
  ) {
    return this.unidades.grade(sessao, id, filtro)
  }

  @Pode('unidade.gerenciar')
  @Post()
  criar(@SessaoDoClube() sessao: SessaoLogada, @Body(new ZodValidationPipe(UnidadeCriarEntrada)) entrada: z.infer<typeof UnidadeCriarEntrada>) {
    return this.unidades.criar(sessao, entrada)
  }

  @Pode('unidade.gerenciar')
  @Patch(':id')
  editar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(UnidadeEditarEntrada)) entrada: z.infer<typeof UnidadeEditarEntrada>,
  ) {
    return this.unidades.editar(sessao, id, entrada)
  }
}
