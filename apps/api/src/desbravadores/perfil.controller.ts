import { Controller, Get, Param } from '@nestjs/common'
import { Uuid } from '@desbravadores/shared'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ServicoPerfil } from './perfil.service'

@Controller('desbravadores')
export class PerfilController {
  constructor(private readonly perfil: ServicoPerfil) {}

  @Pode('dbv.ver')
  @Get(':id/perfil')
  obter(@SessaoDoClube() sessao: SessaoLogada, @Param('id', new ZodValidationPipe(Uuid)) id: string) {
    return this.perfil.perfil(sessao, id)
  }
}
