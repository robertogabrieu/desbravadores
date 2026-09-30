import { Inject, Injectable, Logger } from '@nestjs/common'
import type { PedidoAoAdmEntrada } from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import { emailPedidoUnidadeSemDbv } from '../email/modelos'
import { SERVICO_EMAIL, type ServicoEmail } from '../email/servico-email'

const JANELA_DO_PEDIDO_MS = 24 * 60 * 60 * 1000

@Injectable()
export class PedidosService {
  private readonly logger = new Logger(PedidosService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    @Inject(SERVICO_EMAIL) private readonly email: ServicoEmail,
  ) {}

  /** SPEC Fase 1, 5.6: so o conselheiro pede, pela unidade dele, no maximo uma vez por 24 h. */
  async pedirCadastroDeDesbravadores(sessao: SessaoLogada, entrada: z.infer<typeof PedidoAoAdmEntrada>): Promise<void> {
    const { clubeId } = sessao
    if (sessao.papel !== 'CONSELHEIRO') throw new ErroApp('SEM_PERMISSAO', 'Você não tem permissão para fazer isso.')

    const suas = await this.escopo.unidadesDoConselheiro(sessao)
    const unidade = suas.includes(entrada.unidadeId)
      ? await this.prisma.unidade.findFirst({ where: { clubeId, id: entrada.unidadeId }, select: { id: true, nome: true } })
      : null
    if (!unidade) throw new ErroApp('NAO_ENCONTRADO', 'Unidade não encontrada.')

    const desbravadores = await this.prisma.desbravador.count({
      where: { clubeId, tipo: 'DBV', ativo: true, membros: { some: { clubeId, unidadeId: unidade.id, fim: null } } },
    })
    if (desbravadores > 0) throw new ErroApp('REGRA', 'A unidade já tem desbravadores.')

    const recente = await this.prisma.pedidoAoAdm.findFirst({
      where: {
        clubeId,
        tipo: entrada.tipo,
        unidadeId: unidade.id,
        criadoEm: { gte: new Date(Date.now() - JANELA_DO_PEDIDO_MS) },
      },
      select: { id: true },
    })
    if (recente) return

    const [conselheiro, adms] = await Promise.all([
      this.prisma.usuario.findUniqueOrThrow({ where: { id: sessao.usuarioId }, select: { nome: true } }),
      this.prisma.vinculo.findMany({
        where: { clubeId, papel: 'ADM', ativo: true, usuario: { status: 'ATIVO' } },
        select: { usuario: { select: { email: true } } },
      }),
    ])
    await this.avisarAdms(
      adms.map((adm) => adm.usuario.email),
      conselheiro.nome,
      unidade.nome,
    )
    await this.prisma.pedidoAoAdm.create({
      data: { clubeId, tipo: entrada.tipo, unidadeId: unidade.id, pedidoPorId: sessao.usuarioId },
    })
  }

  /** Falha em alguns e-mails vai ao log; so quando nenhum sai o pedido nao e gravado, para a repeticao valer. */
  private async avisarAdms(emails: string[], conselheiro: string, unidade: string): Promise<void> {
    const resultados = await Promise.allSettled(
      emails.map((para) => this.email.enviar(emailPedidoUnidadeSemDbv({ para, conselheiro, unidade }))),
    )
    const falhas = resultados.filter((resultado) => resultado.status === 'rejected')
    for (const falha of falhas) this.logger.error(`E-mail do pedido ao Adm falhou: ${String(falha.reason)}`)
    if (emails.length > 0 && falhas.length === emails.length) {
      throw new ErroApp('TEMPORARIO', 'Não foi possível avisar o administrador agora. Tente de novo em instantes.')
    }
  }
}
