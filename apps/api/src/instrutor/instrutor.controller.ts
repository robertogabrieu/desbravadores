import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import { Uuid } from '@desbravadores/shared'
import { Logado } from '../comum/decorators/logado.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { InstrutorService } from './instrutor.service'

@Controller()
export class InstrutorController {
  constructor(private readonly instrutor: InstrutorService) {}

  @Logado()
  @Get('inicio/instrutor')
  inicio(@SessaoDoClube() sessao: SessaoLogada) {
    return this.instrutor.inicio(sessao)
  }

  @Logado()
  @Post('classes/:id/pedir-liberacao')
  @HttpCode(204)
  pedirLiberacao(@SessaoDoClube() sessao: SessaoLogada, @Param('id', new ZodValidationPipe(Uuid)) id: string) {
    return this.instrutor.pedirLiberacao(sessao, id)
  }
}
