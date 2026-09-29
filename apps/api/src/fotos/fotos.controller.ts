import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AlbumFiltro, Uuid } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { FiltroFotoGrande } from './filtro-foto-grande'
import { FotosService, type ArquivoEnviado } from './fotos.service'
import { LIMITE_BYTES_FOTO } from './processamento-de-imagem'

const IdDaRota = new ZodValidationPipe(Uuid)

@Controller()
@UseFilters(FiltroFotoGrande)
export class FotosController {
  constructor(private readonly fotos: FotosService) {}

  @Pode('foto.enviar')
  @Put('sync/fotos/:uuid')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: LIMITE_BYTES_FOTO, files: 1 } }))
  enviar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('uuid', IdDaRota) fotoId: string,
    @UploadedFile() arquivo: ArquivoEnviado | undefined,
    @Body() corpo: unknown,
  ) {
    return this.fotos.enviar(sessao, fotoId, corpo, arquivo)
  }

  @Pode('foto.ver')
  @Get('albuns')
  listar(@SessaoDoClube() sessao: SessaoLogada, @Query(new ZodValidationPipe(AlbumFiltro)) filtro: z.infer<typeof AlbumFiltro>) {
    return this.fotos.listarAlbuns(sessao, filtro.unidadeId)
  }

  @Pode('foto.ver')
  @Get('albuns/:id')
  detalhar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.fotos.detalharAlbum(sessao, id)
  }

  @Pode('foto.ver')
  @Delete('fotos/:id')
  @HttpCode(204)
  remover(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.fotos.remover(sessao, id)
  }

  @Pode('foto.ver')
  @Get('unidades/:id/sem-autorizacao-imagem')
  semAutorizacaoDeImagem(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.fotos.semAutorizacaoDeImagem(sessao, id)
  }
}
