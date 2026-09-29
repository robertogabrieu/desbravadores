import { Injectable } from '@nestjs/common'
import type { Papel } from '../generated/prisma/client.js'
import { ErroApp } from '../comum/erros'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'

export interface VinculoAtivo {
  vinculoId: string
  clubeId: string
  papel: Papel
}

@Injectable()
export class ServicoSessao {
  constructor(private readonly prisma: PrismaSistema) {}

  /** Clube e papel vem do banco a cada requisicao (D9); vinculo inativo ou de outro usuario e `null`. */
  async carregarVinculoAtivo(usuarioId: string, vinculoId: string): Promise<VinculoAtivo | null> {
    const vinculo = await this.prisma.vinculo.findFirst({
      where: { id: vinculoId, usuarioId, ativo: true },
      select: { id: true, clubeId: true, papel: true },
    })
    return vinculo ? { vinculoId: vinculo.id, clubeId: vinculo.clubeId, papel: vinculo.papel } : null
  }

  /**
   * Vinculo da sessao (D8): o preferido, se ativo e do usuario; senao o unico ativo; senao `null`
   * (o front vai a `/papel`). Usuario sem nenhum vinculo ativo: `VINCULO_INATIVO`.
   */
  async escolherVinculo(usuarioId: string, preferidoId?: string | null): Promise<string | null> {
    const ativos = await this.prisma.vinculo.findMany({ where: { usuarioId, ativo: true }, select: { id: true } })
    if (ativos.length === 0) {
      throw new ErroApp('VINCULO_INATIVO', 'Você não tem acesso ativo a nenhum clube.')
    }
    if (preferidoId && ativos.some((v) => v.id === preferidoId)) return preferidoId
    return ativos.length === 1 ? (ativos[0]?.id ?? null) : null
  }
}
