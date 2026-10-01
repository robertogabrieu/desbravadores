import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common'
import { ConviteAcessoEntrada, Uuid } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ConviteAcessoService } from './convite-acesso.service'

const IdDaRota = new ZodValidationPipe(Uuid)

@Controller('desbravadores')
export class ConviteAcessoController {
  constructor(private readonly convites: ConviteAcessoService) {}

  @Pode('usuario.gerenciar')
  @Post(':id/convite-acesso')
  gerar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(ConviteAcessoEntrada)) entrada: z.infer<typeof ConviteAcessoEntrada>,
  ) {
    return this.convites.gerar(sessao, id, entrada)
  }

  @Pode('usuario.gerenciar')
  @Get(':id/convite-acesso')
  situacao(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.convites.situacao(sessao, id)
  }

  @Pode('usuario.gerenciar')
  @HttpCode(204)
  @Delete(':id/convite-acesso')
  async cancelar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string): Promise<void> {
    await this.convites.cancelar(sessao, id)
  }
}
