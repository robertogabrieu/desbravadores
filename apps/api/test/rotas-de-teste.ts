import { Controller, Get, Module, Patch, Post, Body, Param } from '@nestjs/common'
import { z } from 'zod'
import { Autenticado } from '../src/comum/decorators/autenticado.decorator'
import { Logado } from '../src/comum/decorators/logado.decorator'
import { Pode } from '../src/comum/decorators/pode.decorator'
import { Publica } from '../src/comum/decorators/publica.decorator'
import { SessaoAtual, SessaoDoClube, type Sessao, type SessaoLogada } from '../src/comum/decorators/sessao.decorator'
import { ErroApp } from '../src/comum/erros'
import { PrismaService } from '../src/comum/prisma/prisma.service'
import { ZodValidationPipe } from '../src/comum/pipes/zod-validation.pipe'

const CorpoDeTeste = z.object({ nome: z.string().min(1), idade: z.coerce.number().int() })
const EditarUnidade = z.object({ nome: z.string().min(1) })

/** Rotas so de teste: exercitam as guardas, o filtro, o pipe e o auxiliar de isolamento. */
@Controller('_teste')
export class RotasDeTesteController {
  constructor(private readonly prisma: PrismaService) {}

  @Autenticado()
  @Get('autenticado')
  autenticado(@SessaoAtual() sessao: Sessao): Sessao {
    return sessao
  }

  @Logado()
  @Get('logado')
  logado(@SessaoAtual() sessao: Sessao): Sessao {
    return sessao
  }

  @Pode('usuario.gerenciar')
  @Get('pode-usuarios')
  podeUsuarios(): { ok: true } {
    return { ok: true }
  }

  @Pode('dbv.editar')
  @Get('pode-editar-dbv')
  podeEditarDbv(): { ok: true } {
    return { ok: true }
  }

  @Pode('dbv.ver')
  @Get('pode-ver-dbv')
  podeVerDbv(): { ok: true } {
    return { ok: true }
  }

  @Logado()
  @Post('validar')
  validar(@Body(new ZodValidationPipe(CorpoDeTeste)) corpo: z.infer<typeof CorpoDeTeste>): z.infer<typeof CorpoDeTeste> {
    return corpo
  }

  @Logado()
  @Get('conflito')
  conflito(): never {
    throw new ErroApp('CONFLITO', 'Já existe uma unidade com esse nome.')
  }

  @Publica()
  @Get('erro-escopo')
  async erroEscopo(): Promise<unknown> {
    return this.prisma.unidade.findMany({})
  }

  @Get('sem-declaracao')
  semDeclaracao(): { ok: true } {
    return { ok: true }
  }

  @Publica()
  @Logado()
  @Get('declaracao-dupla')
  declaracaoDupla(): { ok: true } {
    return { ok: true }
  }

  @Logado()
  @Get('unidades')
  async listarUnidades(@SessaoDoClube() sessao: SessaoLogada): Promise<{ id: string; nome: string }[]> {
    const unidades = await this.prisma.unidade.findMany({ where: { clubeId: sessao.clubeId } })
    return unidades.map((u) => ({ id: u.id, nome: u.nome }))
  }

  @Logado()
  @Get('unidades/:id')
  async lerUnidade(@Param('id') id: string, @SessaoDoClube() sessao: SessaoLogada): Promise<{ id: string; nome: string }> {
    const unidade = await this.prisma.unidade.findFirst({ where: { id, clubeId: sessao.clubeId } })
    if (!unidade) throw new ErroApp('NAO_ENCONTRADO', 'Unidade não encontrada.')
    return { id: unidade.id, nome: unidade.nome }
  }

  @Logado()
  @Patch('unidades/:id')
  async editarUnidade(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(EditarUnidade)) corpo: z.infer<typeof EditarUnidade>,
    @SessaoDoClube() sessao: SessaoLogada,
  ): Promise<{ id: string; nome: string }> {
    const { count } = await this.prisma.unidade.updateMany({
      where: { id, clubeId: sessao.clubeId },
      data: { nome: corpo.nome },
    })
    if (count === 0) throw new ErroApp('NAO_ENCONTRADO', 'Unidade não encontrada.')
    return { id, nome: corpo.nome }
  }
}

@Module({ controllers: [RotasDeTesteController] })
export class RotasDeTesteModule {}
