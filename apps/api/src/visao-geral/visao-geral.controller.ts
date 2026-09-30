import { Controller, Get } from '@nestjs/common'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { VisaoGeralService } from './visao-geral.service'

@Controller('visao-geral')
export class VisaoGeralController {
  constructor(private readonly visaoGeral: VisaoGeralService) {}

  @Pode('relatorio.geral')
  @Get()
  obter(@SessaoDoClube() sessao: SessaoLogada) {
    return this.visaoGeral.obter(sessao.clubeId)
  }
}
