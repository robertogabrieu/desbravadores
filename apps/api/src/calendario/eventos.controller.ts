import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import { CalendarioFiltro, EventoEntrada, MARCACOES_PADRAO, Uuid, type CalendarioSaida, type EventoGravadoSaida, type EventoSaida } from '@desbravadores/shared'
import { z } from 'zod'
import { Logado } from '../comum/decorators/logado.decorator'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ServicoEventos } from './servico-eventos'

/** As três marcações podem faltar: valem as do tipo (`MARCACOES_PADRAO`). */
const EventoGravar = z
  .object({
    ...EventoEntrada.shape,
    cancelaReuniao: z.boolean().optional(),
    bloqueiaAula: z.boolean().optional(),
    bomParaCampo: z.boolean().optional(),
  })
  .refine((e) => e.fim >= e.inicio, { message: 'O fim não pode ser antes do início', path: ['fim'] })

const IdDaRota = new ZodValidationPipe(Uuid)

/** Entrada já com as marcações preenchidas pelo padrão do tipo. */
function comMarcacoes(entrada: z.infer<typeof EventoGravar>): z.infer<typeof EventoEntrada> {
  const padrao = MARCACOES_PADRAO[entrada.tipo]
  return {
    ...entrada,
    cancelaReuniao: entrada.cancelaReuniao ?? padrao.cancelaReuniao,
    bloqueiaAula: entrada.bloqueiaAula ?? padrao.bloqueiaAula,
    bomParaCampo: entrada.bomParaCampo ?? padrao.bomParaCampo,
  }
}

@Controller('calendario')
export class EventosController {
  constructor(private readonly eventos: ServicoEventos) {}

  @Logado()
  @Get()
  ano(
    @SessaoDoClube() sessao: SessaoLogada,
    @Query(new ZodValidationPipe(CalendarioFiltro)) filtro: z.infer<typeof CalendarioFiltro>,
  ): Promise<z.infer<typeof CalendarioSaida>> {
    return this.eventos.doAno(sessao.clubeId, filtro.ano)
  }

  @Logado()
  @Get('eventos/:id')
  obter(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string): Promise<z.infer<typeof EventoSaida>> {
    return this.eventos.obter(sessao.clubeId, id)
  }

  @Pode('calendario.gerenciar')
  @Post('eventos')
  criar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Body(new ZodValidationPipe(EventoGravar)) entrada: z.infer<typeof EventoGravar>,
  ): Promise<z.infer<typeof EventoGravadoSaida>> {
    return this.eventos.criar(sessao, comMarcacoes(entrada))
  }

  @Pode('calendario.gerenciar')
  @Patch('eventos/:id')
  editar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(EventoGravar)) entrada: z.infer<typeof EventoGravar>,
  ): Promise<z.infer<typeof EventoGravadoSaida>> {
    return this.eventos.editar(sessao, id, comMarcacoes(entrada))
  }

  @Pode('calendario.gerenciar')
  @Delete('eventos/:id')
  @HttpCode(204)
  async remover(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string): Promise<void> {
    await this.eventos.remover(sessao, id)
  }
}
