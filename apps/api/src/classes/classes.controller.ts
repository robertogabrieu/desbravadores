import { Controller, Get, Param, Query } from '@nestjs/common'
import { ClasseFiltro, Uuid } from '@desbravadores/shared'
import type { z } from 'zod'
import { Logado } from '../comum/decorators/logado.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { ClassesService } from './classes.service'

@Controller('classes')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Logado()
  @Get()
  listar(@SessaoDoClube() sessao: SessaoLogada, @Query(new ZodValidationPipe(ClasseFiltro)) filtro: z.infer<typeof ClasseFiltro>) {
    return this.classes.listar(sessao.clubeId, filtro)
  }

  @Logado()
  @Get(':id')
  detalhar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', new ZodValidationPipe(Uuid)) id: string) {
    return this.classes.detalhar(sessao.clubeId, id)
  }
}
