import { Injectable } from '@nestjs/common'
import type { FinalidadeToken } from '../generated/prisma/client.js'
import { ErroApp } from '../comum/erros'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'
import { gerarTokenOpaco, hashDoToken } from './tokens'

const HORA_MS = 60 * 60 * 1000

export const VALIDADE_TOKEN_MS: Record<FinalidadeToken, number> = {
  CONVITE: 7 * 24 * HORA_MS,
  SENHA: HORA_MS,
}

@Injectable()
export class ServicoTokenUsoUnico {
  constructor(private readonly prisma: PrismaSistema) {}

  /** Gera um token novo e invalida os anteriores ainda abertos do mesmo usuario e finalidade. */
  async gerar(usuarioId: string, finalidade: FinalidadeToken, agora: Date = new Date()): Promise<string> {
    const token = gerarTokenOpaco()
    await this.prisma.$transaction([
      this.prisma.tokenUsoUnico.updateMany({
        where: { usuarioId, finalidade, usadoEm: null, expiraEm: { gt: agora } },
        data: { expiraEm: agora },
      }),
      this.prisma.tokenUsoUnico.create({
        data: {
          usuarioId,
          finalidade,
          tokenHash: hashDoToken(token),
          expiraEm: new Date(agora.getTime() + VALIDADE_TOKEN_MS[finalidade]),
        },
      }),
    ])
    return token
  }

  /** Marca o token como usado e devolve o usuario; inexistente, usado ou vencido e `TOKEN_INVALIDO`. */
  async consumir(token: string, finalidade: FinalidadeToken, agora: Date = new Date()): Promise<string> {
    const linha = await this.prisma.tokenUsoUnico.findUnique({ where: { tokenHash: hashDoToken(token) } })
    if (linha?.finalidade === finalidade) {
      const { count } = await this.prisma.tokenUsoUnico.updateMany({
        where: { id: linha.id, usadoEm: null, expiraEm: { gt: agora } },
        data: { usadoEm: agora },
      })
      if (count === 1) return linha.usuarioId
    }
    throw new ErroApp('TOKEN_INVALIDO', 'Este link já foi usado ou venceu. Peça um novo.')
  }
}
