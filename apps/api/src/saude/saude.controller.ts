import { Controller, Get } from '@nestjs/common'
import { Publica } from '../comum/decorators/publica.decorator'

@Controller('saude')
export class SaudeController {
  @Publica()
  @Get()
  verificar(): { status: 'ok' } {
    return { status: 'ok' }
  }
}
