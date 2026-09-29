import { Controller, Get } from '@nestjs/common'
import type { PacoteSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { Logado } from '../comum/decorators/logado.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { SyncService } from './sync.service'

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Logado()
  @Get('pacote')
  pacote(@SessaoDoClube() sessao: SessaoLogada): Promise<z.infer<typeof PacoteSaida>> {
    return this.sync.pacote(sessao)
  }
}
