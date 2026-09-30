import { Injectable } from '@nestjs/common'
import type { Prisma, TipoNotificacao } from '../generated/prisma/client.js'

/** Quantas notificacoes cada pessoa guarda; o resto e apagado a cada nova. */
export const LIMITE_POR_PESSOA = 50

export interface EntradaNotificar {
  clubeId: string
  destinos: { usuarioId: string; link: string }[]
  tipo: TipoNotificacao
  titulo: string
  texto: string
}

@Injectable()
export class ServicoNotificacoes {
  /** Uma linha por pessoa (a primeira ocorrencia na lista vale) e poda das mais antigas alem do limite. */
  async notificar(tx: Prisma.TransactionClient, entrada: EntradaNotificar): Promise<void> {
    const { clubeId, tipo, titulo, texto } = entrada
    const linkPorPessoa = new Map<string, string>()
    for (const destino of entrada.destinos) {
      if (!linkPorPessoa.has(destino.usuarioId)) linkPorPessoa.set(destino.usuarioId, destino.link)
    }
    if (linkPorPessoa.size === 0) return

    const criadaEm = new Date()
    await tx.notificacao.createMany({
      data: [...linkPorPessoa].map(([usuarioId, link]) => ({ clubeId, usuarioId, tipo, titulo, texto, link, criadaEm })),
    })
    for (const usuarioId of linkPorPessoa.keys()) await this.podar(tx, clubeId, usuarioId)
  }

  private async podar(tx: Prisma.TransactionClient, clubeId: string, usuarioId: string): Promise<void> {
    const excedentes = await tx.notificacao.findMany({
      where: { clubeId, usuarioId },
      orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }],
      skip: LIMITE_POR_PESSOA,
      select: { id: true },
    })
    if (excedentes.length === 0) return
    await tx.notificacao.deleteMany({ where: { clubeId, usuarioId, id: { in: excedentes.map((n) => n.id) } } })
  }
}
