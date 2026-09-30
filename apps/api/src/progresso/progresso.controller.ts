import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common'
import { MarcarConclusaoEntrada, ProgressoClasseFiltro, Uuid } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { RequisitosDbvService } from './requisitos-dbv.service'
import { ServicoProgresso } from './servico-progresso'

const ParametroUuid = new ZodValidationPipe(Uuid)

@Controller()
export class ProgressoController {
  constructor(
    private readonly progresso: ServicoProgresso,
    private readonly requisitos: RequisitosDbvService,
  ) {}

  @Pode('classe.ver_relatorio')
  @Get('classes/:id/progresso')
  daClasse(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', ParametroUuid) id: string,
    @Query(new ZodValidationPipe(ProgressoClasseFiltro)) filtro: z.infer<typeof ProgressoClasseFiltro>,
  ) {
    return this.progresso.progressoDaClasse(sessao, id, filtro.anoClube)
  }

  @Pode('dbv.ver')
  @Get('desbravadores/:id/progresso')
  doDbv(@SessaoDoClube() sessao: SessaoLogada, @Param('id', ParametroUuid) id: string) {
    return this.progresso.progressoDoDbv(sessao, id)
  }

  @Pode('requisito.marcar')
  @Put('desbravadores/:id/requisitos/:requisitoId')
  marcar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', ParametroUuid) id: string,
    @Param('requisitoId', ParametroUuid) requisitoId: string,
    @Body(new ZodValidationPipe(MarcarConclusaoEntrada)) entrada: z.infer<typeof MarcarConclusaoEntrada>,
  ) {
    return this.requisitos.marcar(sessao, id, requisitoId, entrada.concluidoEm)
  }

  @Pode('requisito.marcar')
  @Delete('desbravadores/:id/requisitos/:requisitoId')
  desmarcar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', ParametroUuid) id: string,
    @Param('requisitoId', ParametroUuid) requisitoId: string,
  ) {
    return this.requisitos.desmarcar(sessao, id, requisitoId)
  }
}
