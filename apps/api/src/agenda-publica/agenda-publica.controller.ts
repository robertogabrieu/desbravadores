import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common'
import { SkipThrottle, Throttle } from '@nestjs/throttler'
import type { AgendaPublicaSaida } from '@desbravadores/shared'
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
  @Header('Cache-Control', 'public, max-age=60')
  @Get(':slug')
  ver(@Param('slug', SlugDaRota) slug: string): Promise<AgendaPublicaSaida> {
    return this.agenda.ver(slug)
  }
}
