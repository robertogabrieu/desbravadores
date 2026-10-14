import { Injectable } from '@nestjs/common'
import { ErroApp } from '../comum/erros'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'

/** Entrega o `clubeId` e o nome de quem abre um link público por slug. */
@Injectable()
export class ClubePorSlugService {
  constructor(private readonly prisma: PrismaSistema) {}

  async resolver(slug: string): Promise<{ clubeId: string; nome: string }> {
    const clube = await this.prisma.clube.findUnique({ where: { slug }, select: { id: true, nome: true } })
    if (!clube) throw new ErroApp('NAO_ENCONTRADO', 'Agenda não encontrada.')
    return { clubeId: clube.id, nome: clube.nome }
  }
}
