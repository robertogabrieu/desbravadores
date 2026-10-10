import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common'
import { AulaEnvio, AulasFiltro, Uuid, type AulaDetalhe, type AulaEnvioSaida, type AulaResumo } from '@desbravadores/shared'
import type { z } from 'zod'
import { PodeOuSubstituto } from '../comum/decorators/pode-ou-substituto.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { AulasEnvioService } from './aulas-envio.service'
import { AulasService } from './aulas.service'

const IdDaRota = new ZodValidationPipe(Uuid)
const REGISTRO_NAO_ENCONTRADO = 'Registro de classe não encontrado.'

/** Link de unidade nao alcanca registro de classe. */
function exigirLinkDeClasse(sessao: SessaoLogada, mensagem: string): void {
  if (sessao.substituicao && sessao.substituicao.classeId === null) throw new ErroApp('NAO_ENCONTRADO', mensagem)
}

@Controller()
export class AulasController {
  constructor(
    private readonly envio: AulasEnvioService,
    private readonly aulas: AulasService,
  ) {}

  @PodeOuSubstituto('aula.registrar')
  @Put('sync/aulas/:uuid')
  enviar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('uuid', IdDaRota) uuid: string,
    @Body(new ZodValidationPipe(AulaEnvio)) corpo: z.infer<typeof AulaEnvio>,
  ): Promise<z.infer<typeof AulaEnvioSaida>> {
    return this.envio.enviar(sessao, uuid, corpo)
  }

  @PodeOuSubstituto('aula.registrar')
  @Get('classes/:id/aulas')
  async listar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) classeId: string,
    @Query(new ZodValidationPipe(AulasFiltro)) filtro: z.infer<typeof AulasFiltro>,
  ): Promise<z.infer<typeof AulaResumo>[]> {
    exigirLinkDeClasse(sessao, 'Classe não encontrada.')
    const aulas = await this.aulas.listar(sessao, classeId, filtro.anoClube)
    const { substituicao } = sessao
    return substituicao ? aulas.filter((aula) => aula.data === substituicao.data) : aulas
  }

  @PodeOuSubstituto('aula.registrar')
  @Get('aulas/:id')
  async detalhe(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string): Promise<z.infer<typeof AulaDetalhe>> {
    exigirLinkDeClasse(sessao, REGISTRO_NAO_ENCONTRADO)
    const detalhe = await this.aulas.detalhe(sessao, id)
    const { substituicao } = sessao
    if (substituicao && (detalhe.classe.id !== substituicao.classeId || detalhe.data !== substituicao.data)) {
      throw new ErroApp('NAO_ENCONTRADO', REGISTRO_NAO_ENCONTRADO)
    }
    return detalhe
  }
}
