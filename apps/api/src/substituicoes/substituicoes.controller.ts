import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common'
import { DatasElegiveisFiltro, GerarSubstituicaoEntrada, Uuid } from '@desbravadores/shared'
import type { Response } from 'express'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { SubstituicoesService } from './substituicoes.service'

const IdDaRota = new ZodValidationPipe(Uuid)
const Geracao = new ZodValidationPipe(GerarSubstituicaoEntrada)
const FiltroDasDatas = new ZodValidationPipe(DatasElegiveisFiltro)

/** Link de substituição gerado pelo Adm na ficha da unidade ou da classe. */
@Controller()
export class SubstituicoesController {
  constructor(private readonly substituicoes: SubstituicoesService) {}

  @Pode('usuario.gerenciar')
  @Get('substituicoes/datas')
  datas(@SessaoDoClube() sessao: SessaoLogada, @Query(FiltroDasDatas) filtro: z.infer<typeof DatasElegiveisFiltro>) {
    return this.substituicoes.datas(sessao.clubeId, filtro.tipo)
  }

  // `res.json` direto nas leituras do alvo: o Nest responde `null` com corpo vazio, e o contrato pede o `null`.
  @Pode('usuario.gerenciar')
  @Get('unidades/:id/substituicao')
  async daUnidade(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string, @Res() res: Response): Promise<void> {
    res.json(await this.substituicoes.aberta(sessao, 'CHAMADA', id))
  }

  @Pode('usuario.gerenciar')
  @Post('unidades/:id/substituicao')
  gerarDaUnidade(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(Geracao) entrada: z.infer<typeof GerarSubstituicaoEntrada>,
  ) {
    return this.substituicoes.gerar(sessao, 'CHAMADA', id, entrada.data)
  }

  @Pode('usuario.gerenciar')
  @HttpCode(204)
  @Delete('unidades/:id/substituicao')
  async cancelarDaUnidade(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string): Promise<void> {
    await this.substituicoes.cancelar(sessao, 'CHAMADA', id)
  }

  @Pode('usuario.gerenciar')
  @Get('classes/:id/substituicao')
  async daClasse(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string, @Res() res: Response): Promise<void> {
    res.json(await this.substituicoes.aberta(sessao, 'CLASSE', id))
  }

  @Pode('usuario.gerenciar')
  @Post('classes/:id/substituicao')
  gerarDaClasse(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(Geracao) entrada: z.infer<typeof GerarSubstituicaoEntrada>,
  ) {
    return this.substituicoes.gerar(sessao, 'CLASSE', id, entrada.data)
  }

  @Pode('usuario.gerenciar')
  @HttpCode(204)
  @Delete('classes/:id/substituicao')
  async cancelarDaClasse(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string): Promise<void> {
    await this.substituicoes.cancelar(sessao, 'CLASSE', id)
  }
}
