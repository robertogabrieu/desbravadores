import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { MaterialEditarEntrada, MaterialLinkEntrada, Uuid } from '@desbravadores/shared'
import { diskStorage } from 'multer'
import type { z } from 'zod'
import { Logado } from '../comum/decorators/logado.decorator'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { FiltroArquivoGrande } from './filtro-arquivo-grande'
import { MateriaisService, type ArquivoEmDisco } from './materiais.service'

export const LIMITE_BYTES_MATERIAL = 20 * 1024 * 1024
export const PASTA_TEMPORARIA_DE_MATERIAIS = join(tmpdir(), 'desbravadores-materiais')

const IdDaRota = new ZodValidationPipe(Uuid)

const ARMAZENAMENTO_TEMPORARIO = diskStorage({
  destination: (_requisicao, _arquivo, concluir) => {
    mkdirSync(PASTA_TEMPORARIA_DE_MATERIAIS, { recursive: true })
    concluir(null, PASTA_TEMPORARIA_DE_MATERIAIS)
  },
})

@Controller()
@UseFilters(new FiltroArquivoGrande())
export class MateriaisController {
  constructor(private readonly materiais: MateriaisService) {}

  @Logado()
  @Get('classes/:id/materiais')
  listar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) classeId: string) {
    return this.materiais.listar(sessao, classeId)
  }

  @Pode('material.enviar')
  @Post('materiais/link')
  criarLink(@SessaoDoClube() sessao: SessaoLogada, @Body(new ZodValidationPipe(MaterialLinkEntrada)) entrada: z.infer<typeof MaterialLinkEntrada>) {
    return this.materiais.criarLink(sessao, entrada)
  }

  @Pode('material.enviar')
  @Post('materiais/arquivo')
  @UseInterceptors(
    FileInterceptor('arquivo', { storage: ARMAZENAMENTO_TEMPORARIO, limits: { fileSize: LIMITE_BYTES_MATERIAL, files: 1 } }),
  )
  criarArquivo(@SessaoDoClube() sessao: SessaoLogada, @UploadedFile() arquivo: ArquivoEmDisco | undefined, @Body() corpo: unknown) {
    return this.materiais.criarArquivo(sessao, corpo, arquivo)
  }

  @Pode('material.enviar')
  @Patch('materiais/:id')
  editar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(MaterialEditarEntrada)) entrada: z.infer<typeof MaterialEditarEntrada>,
  ) {
    return this.materiais.editar(sessao, id, entrada)
  }

  @Pode('material.enviar')
  @Delete('materiais/:id')
  @HttpCode(204)
  apagar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.materiais.apagar(sessao, id)
  }
}
