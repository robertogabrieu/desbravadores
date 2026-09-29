import { Controller, Get } from '@nestjs/common'
import { CATALOGO_PERMISSOES, type CatalogoPermissoesSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'

@Controller('permissoes')
export class PermissoesController {
  @Pode('usuario.gerenciar')
  @Get('catalogo')
  catalogo(): z.infer<typeof CatalogoPermissoesSaida> {
    return Object.entries(CATALOGO_PERMISSOES).map(([chave, item]) => ({
      chave,
      rotulo: item.rotulo,
      padrao: { ...item.padrao },
    }))
  }
}
