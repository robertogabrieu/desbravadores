import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common'
import { ReuniaoEnvio, ReuniaoFiltro, Uuid, type ReuniaoDetalhe, type ReuniaoEnvioSaida, type ReuniaoResumo } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ReunioesEnvioService } from './reunioes-envio.service'
import { ReunioesService } from './reunioes.service'

const IdDaRota = new ZodValidationPipe(Uuid)

@Controller()
export class ReunioesController {
  constructor(
    private readonly envio: ReunioesEnvioService,
    private readonly reunioes: ReunioesService,
  ) {}

  @Pode('reuniao.registrar')
  @Put('sync/reunioes/:uuid')
  enviar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('uuid', IdDaRota) uuid: string,
    @Body(new ZodValidationPipe(ReuniaoEnvio)) corpo: z.infer<typeof ReuniaoEnvio>,
  ): Promise<z.infer<typeof ReuniaoEnvioSaida>> {
    return this.envio.enviar(sessao, uuid, corpo)
  }

  @Pode('reuniao.ver')
  @Get('reunioes')
  listar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Query(new ZodValidationPipe(ReuniaoFiltro)) filtro: z.infer<typeof ReuniaoFiltro>,
  ): Promise<z.infer<typeof ReuniaoResumo>[]> {
    return this.reunioes.listar(sessao, filtro)
  }

  @Pode('reuniao.ver')
  @Get('reunioes/:id')
  detalhe(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string): Promise<z.infer<typeof ReuniaoDetalhe>> {
    return this.reunioes.detalhe(sessao, id)
  }
}
