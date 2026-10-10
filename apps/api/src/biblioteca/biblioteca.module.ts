import { Module } from '@nestjs/common'
import { ArquivosModule } from '../arquivos/arquivos.module'
import { BibliotecaController } from './biblioteca.controller'
import { BibliotecaService } from './biblioteca.service'

@Module({
  imports: [ArquivosModule],
  controllers: [BibliotecaController],
  providers: [BibliotecaService],
})
export class BibliotecaModule {}
