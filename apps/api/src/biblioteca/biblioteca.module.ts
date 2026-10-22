import { Module } from '@nestjs/common'
import { ArquivosModule } from '../arquivos/arquivos.module'
import { BibliotecaController } from './biblioteca.controller'
import { BibliotecaService } from './biblioteca.service'
import { EmprestimosController } from './emprestimos.controller'
import { EmprestimosService } from './emprestimos.service'

@Module({
  imports: [ArquivosModule],
  controllers: [BibliotecaController, EmprestimosController],
  providers: [BibliotecaService, EmprestimosService],
})
export class BibliotecaModule {}
