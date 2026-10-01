import { Body, Controller, Get, Header, HttpCode, Post, StreamableFile, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ImportacaoEntrada, LIMITE_BYTES_IMPORTACAO } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { FiltroImportacao } from './filtro-importacao'
import { ImportacaoService } from './importacao.service'
import { gerarModelo } from './planilha-importacao'

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

@Controller('desbravadores/importacao')
@UseFilters(FiltroImportacao)
export class ImportacaoController {
  constructor(private readonly importacao: ImportacaoService) {}

  @Pode('dbv.cadastrar')
  @Get('modelo')
  @Header('Content-Type', TIPO_XLSX)
  @Header('Content-Disposition', 'attachment; filename="modelo-desbravadores.xlsx"')
  async modelo(): Promise<StreamableFile> {
    return new StreamableFile(await gerarModelo())
  }

  @Pode('dbv.cadastrar')
  @HttpCode(200)
  @Post('previa')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: LIMITE_BYTES_IMPORTACAO, files: 1 } }))
  previa(@SessaoDoClube() sessao: SessaoLogada, @UploadedFile() arquivo: Express.Multer.File | undefined) {
    return this.importacao.previa(sessao, arquivo)
  }

  @Pode('dbv.cadastrar')
  @Post()
  confirmar(@SessaoDoClube() sessao: SessaoLogada, @Body(new ZodValidationPipe(ImportacaoEntrada)) entrada: z.infer<typeof ImportacaoEntrada>) {
    return this.importacao.confirmar(sessao, entrada)
  }
}
