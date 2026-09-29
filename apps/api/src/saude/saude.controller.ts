import { Controller, Get } from '@nestjs/common'
import type { SaudeSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { Publica } from '../comum/decorators/publica.decorator'
import { PrismaService } from '../comum/prisma/prisma.service'

@Controller('saude')
export class SaudeController {
  constructor(private readonly prisma: PrismaService) {}

  @Publica()
  @Get()
  async verificar(): Promise<z.infer<typeof SaudeSaida>> {
    const banco = await this.prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    )
    return { ok: banco, versao: process.env['VERSAO_APP'] ?? '0.0.0', banco }
  }
}
