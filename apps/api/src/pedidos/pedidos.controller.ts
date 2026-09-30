import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { PedidoAoAdmEntrada } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { PedidosService } from './pedidos.service'

@Controller('pedidos-ao-adm')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Pode('reuniao.registrar')
  @Post()
  @HttpCode(204)
  pedir(
    @SessaoDoClube() sessao: SessaoLogada,
    @Body(new ZodValidationPipe(PedidoAoAdmEntrada)) entrada: z.infer<typeof PedidoAoAdmEntrada>,
  ) {
    return this.pedidos.pedirCadastroDeDesbravadores(sessao, entrada)
  }
}
