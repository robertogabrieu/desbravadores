import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common'
import { SkipThrottle, Throttle } from '@nestjs/throttler'
import type { AgendaPublicaSaida } from '@desbravadores/shared'
import type { Response } from 'express'
import { z } from 'zod'
import { GuardaLimite, LIMITE_AGENDA_PUBLICA } from '../auth/limite'
import { Publica } from '../comum/decorators/publica.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { AgendaPublicaService } from './agenda-publica.service'

const SlugDaRota = new ZodValidationPipe(z.string().min(1).max(100))

/** `/agenda-publica/:slug`: a agenda do clube aberta aos pais, sem login. */
@Controller('agenda-publica')
export class AgendaPublicaController {
  constructor(private readonly agenda: AgendaPublicaService) {}

  @Publica()
  @UseGuards(GuardaLimite)
  @SkipThrottle({ porEmail: true })
  @Throttle(LIMITE_AGENDA_PUBLICA)
  @Get(':slug')
  async ver(@Param('slug', SlugDaRota) slug: string, @Res({ passthrough: true }) res: Response): Promise<AgendaPublicaSaida> {
    const saida = await this.agenda.ver(slug)
    // Só a resposta de sucesso pode ser guardada: o 404 e os demais erros saem sem este cabeçalho.
    res.setHeader('Cache-Control', 'public, max-age=60')
    return saida
  }
}
