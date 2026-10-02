import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, type PipeTransform } from '@nestjs/common'
import { CalendarioFiltro, EventoEntrada, MARCACOES_PADRAO, Uuid, validarEvento, type CalendarioSaida, type EventoGravadoSaida, type EventoSaida } from '@desbravadores/shared'
import { z } from 'zod'
import { Logado } from '../comum/decorators/logado.decorator'
import { Pode } from '../comum/decorators/pode.decorator'
import { ErroApp } from '../comum/erros'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ServicoEventos } from './servico-eventos'

/** O objeto do Zod não é estrito: sem este pipe, as chaves de uma aba antiga sumiriam caladas. */
class RecusarMarcacoesAntigas implements PipeTransform<unknown, unknown> {
  transform(corpo: unknown): unknown {
    const antiga = typeof corpo === 'object' && corpo !== null && ('cancelaReuniao' in corpo || 'bloqueiaAula' in corpo)
    if (antiga) throw new ErroApp('VALIDACAO', 'Atualize o app para salvar este evento.')
    return corpo
  }
}

/** As três marcações podem faltar: valem as do tipo (`MARCACOES_PADRAO`). */
const EventoGravar = z
  .object({
    ...EventoEntrada.shape,
    temReuniao: z.boolean().optional(),
    temClasse: z.boolean().optional(),
    bomParaCampo: z.boolean().optional(),
  })

const IdDaRota = new ZodValidationPipe(Uuid)

/** Entrada com as marcações do padrão do tipo (Férias o força; a extra nunca é boa para campo), já validada. */
function comMarcacoes(entrada: z.infer<typeof EventoGravar>): z.infer<typeof EventoEntrada> {
  const padrao = MARCACOES_PADRAO[entrada.tipo]
  const completo =
    entrada.tipo === 'FERIAS'
      ? { ...entrada, ...padrao }
      : {
          ...entrada,
          temReuniao: entrada.temReuniao ?? padrao.temReuniao,
          temClasse: entrada.temClasse ?? padrao.temClasse,
          bomParaCampo: entrada.tipo === 'REUNIAO_EXTRA' ? false : (entrada.bomParaCampo ?? padrao.bomParaCampo),
        }
  const problemas = validarEvento(completo)
  if (problemas.length > 0) {
    throw new ErroApp('VALIDACAO', 'Confira os campos informados.', Object.fromEntries(problemas.map((p) => [p.campo, p.mensagem])))
  }
  return completo
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
    @Body(new RecusarMarcacoesAntigas(), new ZodValidationPipe(EventoGravar)) entrada: z.infer<typeof EventoGravar>,
  ): Promise<z.infer<typeof EventoGravadoSaida>> {
    return this.eventos.criar(sessao, comMarcacoes(entrada))
  }

  @Pode('calendario.gerenciar')
  @Patch('eventos/:id')
  editar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new RecusarMarcacoesAntigas(), new ZodValidationPipe(EventoGravar)) entrada: z.infer<typeof EventoGravar>,
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
