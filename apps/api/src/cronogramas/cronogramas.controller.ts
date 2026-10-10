import { Controller, Get, Param, Query } from '@nestjs/common'
import { CronogramaLeituraFiltro, Uuid, type CronogramaLeitura } from '@desbravadores/shared'
import type { z } from 'zod'
import { LogadoOuSubstituto } from '../comum/decorators/logado-ou-substituto.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ServicoCronograma } from './servico-cronograma'

@Controller('classes')
export class CronogramasController {
  constructor(private readonly cronogramas: ServicoCronograma) {}

  @LogadoOuSubstituto()
  @Get(':id/cronograma')
  leitura(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', new ZodValidationPipe(Uuid)) classeId: string,
    @Query(new ZodValidationPipe(CronogramaLeituraFiltro)) filtro: z.infer<typeof CronogramaLeituraFiltro>,
  ): Promise<z.infer<typeof CronogramaLeitura>> {
    // Link de unidade nao alcanca cronograma; o de classe, so a classe dele (pelo escopo do servico).
    if (sessao.substituicao && sessao.substituicao.classeId === null) throw new ErroApp('NAO_ENCONTRADO', 'Classe não encontrada.')
    return this.cronogramas.leitura(sessao, classeId, filtro.anoClube)
  }
}
