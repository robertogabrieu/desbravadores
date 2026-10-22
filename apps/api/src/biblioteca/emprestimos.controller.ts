import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { BuscaDeDesbravadorParaEmprestimo, EmprestimoEntrada, EmprestimosFiltro, Uuid } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { EmprestimosService } from './emprestimos.service'

const IdDaRota = new ZodValidationPipe(Uuid)

@Controller('biblioteca')
export class EmprestimosController {
  constructor(private readonly emprestimos: EmprestimosService) {}

  @Pode('biblioteca.emprestar')
  @Post('emprestimos')
  emprestar(@SessaoDoClube() sessao: SessaoLogada, @Body(new ZodValidationPipe(EmprestimoEntrada)) entrada: EmprestimoEntrada) {
    return this.emprestimos.emprestar(sessao, entrada)
  }

  /** Sem corpo: a data da devolução é o hoje do servidor. */
  @Pode('biblioteca.emprestar')
  @Post('emprestimos/:id/devolucao')
  devolver(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.emprestimos.devolver(sessao, id)
  }

  @Pode('biblioteca.gerenciar')
  @Get('emprestimos')
  listar(@SessaoDoClube() sessao: SessaoLogada, @Query(new ZodValidationPipe(EmprestimosFiltro)) filtro: z.output<typeof EmprestimosFiltro>) {
    return this.emprestimos.listar(sessao, filtro)
  }

  @Pode('biblioteca.emprestar')
  @Get('itens/:id/exemplares')
  exemplares(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.emprestimos.exemplaresDoLivro(sessao, id)
  }

  @Pode('biblioteca.emprestar')
  @Get('desbravadores')
  buscarDesbravadores(
    @SessaoDoClube() sessao: SessaoLogada,
    @Query(new ZodValidationPipe(BuscaDeDesbravadorParaEmprestimo)) filtro: BuscaDeDesbravadorParaEmprestimo,
  ) {
    return this.emprestimos.buscarDesbravadores(sessao, filtro)
  }
}
