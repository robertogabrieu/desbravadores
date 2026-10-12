import { Body, Controller, Get, Param, Patch } from '@nestjs/common'
import { RegraEntrada, type RegraSaida, type RegrasSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { Logado } from '../../comum/decorators/logado.decorator'
import { Pode } from '../../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../../comum/pipes/zod-validation.pipe'
import { ServicoRegras } from './regras.service'

/** Tela "Regras de pontuação" do ranking: as 9 regras fixas do clube e os eventos especiais do ano. */
@Controller('ranking/regras')
export class RegrasController {
  constructor(private readonly regras: ServicoRegras) {}

  @Logado()
  @Get()
  listar(@SessaoDoClube() sessao: SessaoLogada): Promise<z.infer<typeof RegrasSaida>> {
    return this.regras.listar(sessao)
  }

  @Pode('ranking.configurar')
  @Patch(':gatilho')
  alterar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('gatilho') gatilho: string,
    @Body(new ZodValidationPipe(RegraEntrada)) entrada: z.infer<typeof RegraEntrada>,
  ): Promise<z.infer<typeof RegraSaida>> {
    return this.regras.alterar(sessao, gatilho, entrada)
  }
}
