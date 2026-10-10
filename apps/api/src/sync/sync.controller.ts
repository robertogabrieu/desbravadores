import { Controller, Get } from '@nestjs/common'
import type { PacoteSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { LogadoOuSubstituto } from '../comum/decorators/logado-ou-substituto.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { SyncService } from './sync.service'

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @LogadoOuSubstituto()
  @Get('pacote')
  pacote(@SessaoDoClube() sessao: SessaoLogada): Promise<z.infer<typeof PacoteSaida>> {
    return this.sync.pacote(sessao)
  }
}
