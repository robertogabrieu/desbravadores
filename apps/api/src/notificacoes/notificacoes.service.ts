import { Injectable } from '@nestjs/common'
import type { NotificacoesSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { PrismaService } from '../comum/prisma/prisma.service'
import { LIMITE_POR_PESSOA } from './servico-notificacoes'

@Injectable()
export class NotificacoesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(sessao: SessaoLogada): Promise<z.infer<typeof NotificacoesSaida>> {
    const { clubeId, usuarioId } = sessao
    const [itens, naoLidas] = await Promise.all([
      this.prisma.notificacao.findMany({
        where: { clubeId, usuarioId },
        orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }],
        take: LIMITE_POR_PESSOA,
      }),
      this.prisma.notificacao.count({ where: { clubeId, usuarioId, lidaEm: null } }),
    ])
    return {
      itens: itens.map((n) => ({
        id: n.id, tipo: n.tipo, titulo: n.titulo, texto: n.texto, link: n.link, criadaEm: n.criadaEm.toISOString(), lida: n.lidaEm !== null,
      })),
      naoLidas,
    }
  }

  /** Marcar de novo uma ja lida nao e erro; de outra pessoa ou de outro clube e 404. */
  async marcarLida(sessao: SessaoLogada, id: string): Promise<void> {
    const { clubeId, usuarioId } = sessao
    const notificacao = await this.prisma.notificacao.findFirst({ where: { clubeId, usuarioId, id }, select: { lidaEm: true } })
    if (!notificacao) throw new ErroApp('NAO_ENCONTRADO', 'Notificação não encontrada.')
    if (notificacao.lidaEm) return
    await this.prisma.notificacao.updateMany({ where: { clubeId, usuarioId, id, lidaEm: null }, data: { lidaEm: new Date() } })
  }

  async marcarTodasLidas(sessao: SessaoLogada): Promise<void> {
    const { clubeId, usuarioId } = sessao
    await this.prisma.notificacao.updateMany({ where: { clubeId, usuarioId, lidaEm: null }, data: { lidaEm: new Date() } })
  }
}
