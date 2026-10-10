import { mkdirSync } from 'node:fs'
import { Body, Controller, Get, Param, Patch, Post, Put, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { EdicaoRascunhoEntrada, GruposEntrada, MaterialCBLinkEntrada, TerminarEntrada, Uuid } from '@desbravadores/shared'
import { diskStorage } from 'multer'
import type { z } from 'zod'
import { Logado } from '../comum/decorators/logado.decorator'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { LIMITE_BYTES_MATERIAL, PASTA_TEMPORARIA_DE_MATERIAIS } from '../materiais/materiais.controller'
import { FiltroArquivoGrande } from '../materiais/filtro-arquivo-grande'
import type { ArquivoEmDisco } from '../materiais/materiais.service'
import { ServicoEdicoes } from './servico-edicoes'
import { ServicoPainel } from './servico-painel'

const IdDaRota = new ZodValidationPipe(Uuid)

const ARMAZENAMENTO_TEMPORARIO = diskStorage({
  destination: (_requisicao, _arquivo, concluir) => {
    mkdirSync(PASTA_TEMPORARIA_DE_MATERIAIS, { recursive: true })
    concluir(null, PASTA_TEMPORARIA_DE_MATERIAIS)
  },
})

@Controller('classe-biblica')
export class EdicoesController {
  constructor(
    private readonly edicoes: ServicoEdicoes,
    private readonly painel: ServicoPainel,
  ) {}

  @Pode('classebiblica.gerenciar')
  @Get('edicoes')
  listar(@SessaoDoClube() sessao: SessaoLogada) {
    return this.painel.lista(sessao)
  }

  @Pode('classebiblica.gerenciar')
  @Post('edicoes')
  criar(@SessaoDoClube() sessao: SessaoLogada, @Body(new ZodValidationPipe(EdicaoRascunhoEntrada)) entrada: z.infer<typeof EdicaoRascunhoEntrada>) {
    return this.edicoes.criar(sessao, entrada)
  }

  @Pode('classebiblica.gerenciar')
  @Patch('edicoes/:id')
  editar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(EdicaoRascunhoEntrada)) entrada: z.infer<typeof EdicaoRascunhoEntrada>,
  ) {
    return this.edicoes.editar(sessao, id, entrada)
  }

  /** Guarda própria no serviço: gerenciar, ou a chamada com grupo no escopo (`@Pode` aceita uma chave só). */
  @Logado()
  @Get('edicoes/:id')
  verPainel(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.painel.painel(sessao, id)
  }

  @Pode('classebiblica.gerenciar')
  @Get('edicoes/:id/grupos')
  grupos(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.edicoes.grupos(sessao, id)
  }

  @Pode('classebiblica.gerenciar')
  @Put('edicoes/:id/grupos')
  salvarGrupos(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(GruposEntrada)) entrada: z.infer<typeof GruposEntrada>,
  ) {
    return this.edicoes.salvarGrupos(sessao, id, entrada)
  }

  @Pode('classebiblica.gerenciar')
  @Get('edicoes/:id/datas')
  datas(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.edicoes.datas(sessao, id)
  }

  @Pode('classebiblica.gerenciar')
  @Post('edicoes/:id/terminar')
  async terminar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(TerminarEntrada)) entrada: z.infer<typeof TerminarEntrada>,
  ) {
    await this.edicoes.terminar(sessao, id, entrada)
    return this.painel.painel(sessao, id)
  }

  @Logado()
  @Get('grupos/:grupoId/frequencia')
  frequencia(@SessaoDoClube() sessao: SessaoLogada, @Param('grupoId', IdDaRota) grupoId: string) {
    return this.painel.frequencia(sessao, grupoId)
  }

  @Pode('classebiblica.gerenciar')
  @Post('grupos/:grupoId/material/link')
  anexarLink(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('grupoId', IdDaRota) grupoId: string,
    @Body(new ZodValidationPipe(MaterialCBLinkEntrada)) entrada: z.infer<typeof MaterialCBLinkEntrada>,
  ) {
    return this.edicoes.anexarLink(sessao, grupoId, entrada)
  }

  @Pode('classebiblica.gerenciar')
  @Post('grupos/:grupoId/material/arquivo')
  @UseFilters(FiltroArquivoGrande)
  @UseInterceptors(FileInterceptor('arquivo', { storage: ARMAZENAMENTO_TEMPORARIO, limits: { fileSize: LIMITE_BYTES_MATERIAL, files: 1 } }))
  anexarArquivo(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('grupoId', IdDaRota) grupoId: string,
    @UploadedFile() arquivo: ArquivoEmDisco | undefined,
    @Body() corpo: unknown,
  ) {
    return this.edicoes.anexarArquivo(sessao, grupoId, corpo, arquivo)
  }
}
