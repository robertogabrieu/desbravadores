import { extname } from 'node:path'
import { Controller, Get, Inject, Param, Query, Res, StreamableFile } from '@nestjs/common'
import { Uuid } from '@desbravadores/shared'
import type { Response } from 'express'
import { z } from 'zod'
import { Publica } from '../comum/decorators/publica.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ARMAZENAMENTO, type Armazenamento } from './armazenamento'
import { cabecalhoDeDisposicao } from './disposicao'
import { ServicoArquivos, VALIDADE_URL_SEGUNDOS } from './servico-arquivos'

const ConsultaArquivo = z.object({
  c: Uuid,
  v: z.enum(['original', 'miniatura']),
  exp: z.string().regex(/^\d{1,12}$/),
  sig: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
})

const NEGADO = 'Link inválido ou vencido.'

@Controller('arquivos')
export class ArquivosController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly arquivos: ServicoArquivos,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
  ) {}

  @Publica()
  @Get(':id')
  async servir(
    @Param('id') id: string,
    @Query() consulta: Record<string, unknown>,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<StreamableFile> {
    const idValido = Uuid.safeParse(id)
    const dados = ConsultaArquivo.safeParse(consulta)
    if (!idValido.success || !dados.success) throw new ErroApp('SEM_PERMISSAO', NEGADO)

    const exp = Number(dados.data.exp)
    const agora = Math.floor(Date.now() / 1000)
    if (exp < agora || exp > agora + VALIDADE_URL_SEGUNDOS) throw new ErroApp('SEM_PERMISSAO', NEGADO)
    if (!this.arquivos.assinaturaConfere(id, dados.data.v, exp, dados.data.sig)) throw new ErroApp('SEM_PERMISSAO', NEGADO)

    const arquivo = await this.prisma.arquivo.findFirst({
      where: { clubeId: dados.data.c, id },
      select: {
        caminho: true,
        miniaturaCaminho: true,
        mime: true,
        foto: { select: { removidaEm: true } },
        material: { select: { titulo: true, removidoEm: true } },
      },
    })
    const caminho = dados.data.v === 'miniatura' ? arquivo?.miniaturaCaminho : arquivo?.caminho
    if (!arquivo || arquivo.foto?.removidaEm || arquivo.material?.removidoEm || !caminho) {
      throw new ErroApp('NAO_ENCONTRADO', 'Arquivo não encontrado.')
    }

    // A miniatura e sempre JPEG; o original serve com o mime gravado no banco.
    const mime = dados.data.v === 'miniatura' ? 'image/jpeg' : arquivo.mime
    resposta.setHeader('Cache-Control', 'no-store')
    resposta.setHeader('X-Content-Type-Options', 'nosniff')
    // O helmet global poe uma CSP em toda resposta; so o PDF a dispensa (o visualizador dele nao abre sob `sandbox`).
    resposta.removeHeader('Content-Security-Policy')
    if (mime !== 'application/pdf') resposta.setHeader('Content-Security-Policy', 'sandbox')
    if (!mime.startsWith('image/')) this.protegerDocumento(resposta, mime, arquivo.material?.titulo ?? 'arquivo', extname(caminho).slice(1))
    return new StreamableFile(this.armazenamento.abrir(caminho), { type: mime })
  }

  /** PDF abre no navegador; o resto baixa e nunca executa aqui (o `sandbox` de todo nao-PDF vem de quem chama). */
  private protegerDocumento(resposta: Response, mime: string, titulo: string, ext: string): void {
    const ehPdf = mime === 'application/pdf'
    resposta.setHeader('Content-Disposition', cabecalhoDeDisposicao(ehPdf ? 'inline' : 'attachment', titulo, ext))
  }
}
