import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ErroApp } from '../comum/erros'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'
import { ServicoSessao } from './sessao.service'
import { gerarTokenOpaco, hashDoToken } from './tokens'

const DIA_MS = 24 * 60 * 60 * 1000
export const VALIDADE_FAMILIA_MS = 30 * DIA_MS
export const TOLERANCIA_DE_REUSO_MS = 30 * 1000

export interface RefreshEmitido {
  /** Valor opaco que vai no cookie; o banco guarda so o hash. */
  token: string
  familia: string
  usuarioId: string
  vinculoId: string | null
}

interface OpcoesDeRotacao {
  /** Troca de papel: o vinculo precisa ser do usuario e estar ativo. */
  vinculoId?: string
  agora?: Date
}

@Injectable()
export class ServicoRefresh {
  constructor(
    private readonly prisma: PrismaSistema,
    private readonly sessao: ServicoSessao,
  ) {}

  /** Login: abre uma familia nova, valida por 30 dias desde agora, no vinculo escolhido. */
  async criarFamilia(
    usuarioId: string,
    opcoes: { aparelho?: string; agora?: Date } = {},
  ): Promise<RefreshEmitido> {
    const agora = opcoes.agora ?? new Date()
    const vinculoId = await this.sessao.escolherVinculo(usuarioId)
    const familia = randomUUID()
    const familiaExpiraEm = new Date(agora.getTime() + VALIDADE_FAMILIA_MS)
    return this.emitir({ usuarioId, vinculoId, familia, familiaExpiraEm, aparelho: opcoes.aparelho })
  }

  /**
   * Troca o refresh por um sucessor na mesma familia. Token ja usado ha ate 30 s ainda emite
   * sucessor (duas abas, resposta perdida); depois disso e reuso e revoga a familia inteira.
   */
  async rotacionar(token: string, opcoes: OpcoesDeRotacao = {}): Promise<RefreshEmitido> {
    const agora = opcoes.agora ?? new Date()
    const atual = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashDoToken(token) } })
    if (!atual || atual.revogadoEm || atual.familiaExpiraEm <= agora || atual.expiraEm <= agora) {
      throw sessaoInvalida()
    }

    if (atual.usadoEm && agora.getTime() - atual.usadoEm.getTime() > TOLERANCIA_DE_REUSO_MS) {
      await this.revogarFamilia(atual.familia, agora)
      throw sessaoInvalida()
    }

    const vinculoId = await this.vinculoDaRotacao(atual.usuarioId, atual.vinculoId, opcoes.vinculoId)
    // So o primeiro uso marca o token; se outra requisicao marcou entre a leitura e aqui, ela cai na tolerancia.
    await this.prisma.refreshToken.updateMany({ where: { id: atual.id, usadoEm: null }, data: { usadoEm: agora } })
    return this.emitir({
      usuarioId: atual.usuarioId,
      vinculoId,
      familia: atual.familia,
      familiaExpiraEm: atual.familiaExpiraEm,
      aparelho: atual.aparelho ?? undefined,
    })
  }

  /** Logout: revoga a familia do token apresentado (token desconhecido nao e erro). */
  async revogarFamiliaDoToken(token: string, agora: Date = new Date()): Promise<void> {
    const atual = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashDoToken(token) } })
    if (atual) await this.revogarFamilia(atual.familia, agora)
  }

  /** Sair de todos, redefinicao de senha: revoga todas as familias do usuario. */
  async revogarFamilias(usuarioId: string, agora: Date = new Date()): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { usuarioId, revogadoEm: null }, data: { revogadoEm: agora } })
  }

  private async revogarFamilia(familia: string, agora: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { familia, revogadoEm: null }, data: { revogadoEm: agora } })
  }

  private async vinculoDaRotacao(
    usuarioId: string,
    vinculoDaFamilia: string | null,
    escolhido?: string,
  ): Promise<string | null> {
    if (escolhido === undefined) return this.sessao.escolherVinculo(usuarioId, vinculoDaFamilia)
    const vinculo = await this.sessao.carregarVinculoAtivo(usuarioId, escolhido)
    if (!vinculo) throw new ErroApp('VINCULO_INATIVO', 'Esse acesso não está disponível para você.')
    return vinculo.vinculoId
  }

  private async emitir(dados: {
    usuarioId: string
    vinculoId: string | null
    familia: string
    familiaExpiraEm: Date
    aparelho?: string
  }): Promise<RefreshEmitido> {
    const token = gerarTokenOpaco()
    await this.prisma.refreshToken.create({
      data: {
        usuarioId: dados.usuarioId,
        vinculoId: dados.vinculoId,
        familia: dados.familia,
        familiaExpiraEm: dados.familiaExpiraEm,
        tokenHash: hashDoToken(token),
        expiraEm: dados.familiaExpiraEm,
        aparelho: dados.aparelho ?? null,
      },
    })
    return { token, familia: dados.familia, usuarioId: dados.usuarioId, vinculoId: dados.vinculoId }
  }
}

function sessaoInvalida(): ErroApp {
  return new ErroApp('NAO_AUTENTICADO', 'Sua sessão expirou. Entre de novo.')
}
