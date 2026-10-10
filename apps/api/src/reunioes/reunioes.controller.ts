import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common'
import { ReuniaoEnvio, ReuniaoFiltro, Uuid, type ReuniaoDetalhe, type ReuniaoEnvioSaida, type ReuniaoResumo } from '@desbravadores/shared'
import type { z } from 'zod'
import { PodeOuSubstituto } from '../comum/decorators/pode-ou-substituto.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ReunioesEnvioService } from './reunioes-envio.service'
import { ReunioesService } from './reunioes.service'

const IdDaRota = new ZodValidationPipe(Uuid)
const NAO_ENCONTRADA = 'Reunião não encontrada.'

/** Link de classe nao alcanca reuniao. */
function exigirLinkDeUnidade(sessao: SessaoLogada): void {
  if (sessao.substituicao && sessao.substituicao.unidadeId === null) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADA)
}

@Controller()
export class ReunioesController {
  constructor(
    private readonly envio: ReunioesEnvioService,
    private readonly reunioes: ReunioesService,
  ) {}

  @PodeOuSubstituto('reuniao.registrar')
  @Put('sync/reunioes/:uuid')
  enviar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('uuid', IdDaRota) uuid: string,
    @Body(new ZodValidationPipe(ReuniaoEnvio)) corpo: z.infer<typeof ReuniaoEnvio>,
  ): Promise<z.infer<typeof ReuniaoEnvioSaida>> {
    exigirLinkDeUnidade(sessao)
    return this.envio.enviar(sessao, uuid, corpo)
  }

  @PodeOuSubstituto('reuniao.ver')
  @Get('reunioes')
  async listar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Query(new ZodValidationPipe(ReuniaoFiltro)) filtro: z.infer<typeof ReuniaoFiltro>,
  ): Promise<z.infer<typeof ReuniaoResumo>[]> {
    exigirLinkDeUnidade(sessao)
    const reunioes = await this.reunioes.listar(sessao, filtro)
    const { substituicao } = sessao
    return substituicao ? reunioes.filter((reuniao) => reuniao.data === substituicao.data) : reunioes
  }

  @PodeOuSubstituto('reuniao.ver')
  @Get('reunioes/:id')
  async detalhe(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string): Promise<z.infer<typeof ReuniaoDetalhe>> {
    exigirLinkDeUnidade(sessao)
    const detalhe = await this.reunioes.detalhe(sessao, id)
    const { substituicao } = sessao
    if (substituicao && (detalhe.unidade.id !== substituicao.unidadeId || detalhe.data !== substituicao.data)) {
      throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADA)
    }
    return detalhe
  }
}
