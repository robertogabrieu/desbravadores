import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  CategoriaBibliotecaEntrada,
  ItemBibliotecaEditar,
  LIMITE_BYTES_CAPA_BIBLIOTECA,
  LIMITE_BYTES_PDF_BIBLIOTECA,
  MoverNaBiblioteca,
  Uuid,
} from '@desbravadores/shared'
import { diskStorage } from 'multer'
import { Logado } from '../comum/decorators/logado.decorator'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { FiltroArquivoGrande } from '../materiais/filtro-arquivo-grande'
import { BibliotecaService, type ArquivoEmDisco } from './biblioteca.service'

export const PASTA_TEMPORARIA_DA_BIBLIOTECA = join(tmpdir(), 'desbravadores-biblioteca')

const IdDaRota = new ZodValidationPipe(Uuid)

const ARMAZENAMENTO_TEMPORARIO = diskStorage({
  destination: (_requisicao, _arquivo, concluir) => {
    mkdirSync(PASTA_TEMPORARIA_DA_BIBLIOTECA, { recursive: true })
    concluir(null, PASTA_TEMPORARIA_DA_BIBLIOTECA)
  },
})

@Controller('biblioteca')
export class BibliotecaController {
  constructor(private readonly biblioteca: BibliotecaService) {}

  @Logado()
  @Get()
  listar(@SessaoDoClube() sessao: SessaoLogada) {
    return this.biblioteca.listar(sessao)
  }

  @Pode('biblioteca.gerenciar')
  @Post('categorias')
  criarCategoria(@SessaoDoClube() sessao: SessaoLogada, @Body(new ZodValidationPipe(CategoriaBibliotecaEntrada)) entrada: CategoriaBibliotecaEntrada) {
    return this.biblioteca.criarCategoria(sessao, entrada)
  }

  @Pode('biblioteca.gerenciar')
  @Patch('categorias/:id')
  renomearCategoria(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(CategoriaBibliotecaEntrada)) entrada: CategoriaBibliotecaEntrada,
  ) {
    return this.biblioteca.renomearCategoria(sessao, id, entrada)
  }

  @Pode('biblioteca.gerenciar')
  @Post('categorias/:id/mover')
  @HttpCode(204)
  moverCategoria(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(MoverNaBiblioteca)) entrada: MoverNaBiblioteca,
  ) {
    return this.biblioteca.moverCategoria(sessao, id, entrada)
  }

  @Pode('biblioteca.gerenciar')
  @Delete('categorias/:id')
  @HttpCode(204)
  excluirCategoria(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.biblioteca.excluirCategoria(sessao, id)
  }

  @Pode('biblioteca.gerenciar')
  @Post('itens')
  @UseFilters(new FiltroArquivoGrande('O PDF pode ter até 50 MB.'))
  @UseInterceptors(
    FileInterceptor('arquivo', { storage: ARMAZENAMENTO_TEMPORARIO, limits: { fileSize: LIMITE_BYTES_PDF_BIBLIOTECA, files: 1 } }),
  )
  criarItem(@SessaoDoClube() sessao: SessaoLogada, @UploadedFile() arquivo: ArquivoEmDisco | undefined, @Body() corpo: unknown) {
    return this.biblioteca.criarItem(sessao, corpo, arquivo)
  }

  @Pode('biblioteca.gerenciar')
  @Patch('itens/:id')
  editarItem(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(ItemBibliotecaEditar)) entrada: ItemBibliotecaEditar,
  ) {
    return this.biblioteca.editarItem(sessao, id, entrada)
  }

  // O id não passa pelo pipe: ele rodaria depois do multer e deixaria o temporário para trás; o service o confere.
  @Pode('biblioteca.gerenciar')
  @Put('itens/:id/capa')
  @UseFilters(new FiltroArquivoGrande('A capa pode ter até 5 MB.'))
  @UseInterceptors(
    FileInterceptor('capa', { storage: ARMAZENAMENTO_TEMPORARIO, limits: { fileSize: LIMITE_BYTES_CAPA_BIBLIOTECA, files: 1 } }),
  )
  porCapa(@SessaoDoClube() sessao: SessaoLogada, @Param('id') id: string, @UploadedFile() capa: ArquivoEmDisco | undefined) {
    return this.biblioteca.porCapa(sessao, id, capa)
  }

  @Pode('biblioteca.gerenciar')
  @Delete('itens/:id/capa')
  tirarCapa(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.biblioteca.tirarCapa(sessao, id)
  }

  @Pode('biblioteca.gerenciar')
  @Post('itens/:id/mover')
  @HttpCode(204)
  moverItem(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(MoverNaBiblioteca)) entrada: MoverNaBiblioteca,
  ) {
    return this.biblioteca.moverItem(sessao, id, entrada)
  }

  @Pode('biblioteca.gerenciar')
  @Delete('itens/:id')
  @HttpCode(204)
  removerItem(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.biblioteca.removerItem(sessao, id)
  }
}
