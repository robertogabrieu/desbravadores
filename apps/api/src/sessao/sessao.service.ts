import { Injectable } from '@nestjs/common'
import type { Papel, TipoSubstituicao } from '../generated/prisma/client.js'
import { ErroApp } from '../comum/erros'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'

export interface VinculoAtivo {
  vinculoId: string
  clubeId: string
  papel: Papel
}

/** Leitura vale ate o fim do link; gravacao, ate o fim do envio. */
export type OperacaoDaSubstituicao = 'LEITURA' | 'GRAVACAO'

export interface SubstituicaoAtiva {
  substituicaoId: string
  /** O autor: membro reconhecido ou usuario de substituicao. */
  usuarioId: string
  clubeId: string
  papel: Papel
  unidadeId: string | null
  classeId: string | null
  /** Dia civil do link, `AAAA-MM-DD`. */
  data: string
}

function linkEncerrado(): ErroApp {
  return new ErroApp('SUBSTITUICAO_ENCERRADA', 'Este link de substituição foi encerrado.')
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

  /**
   * Link de substituicao conferido no banco a cada requisicao, como o vinculo: cancelado, sem
   * aparelho identificado, alvo desativado ou fora do prazo da operacao e `SUBSTITUICAO_ENCERRADA`.
   */
  async carregarSubstituicao(
    substituicaoId: string,
    operacao: OperacaoDaSubstituicao,
    agora: Date = new Date(),
  ): Promise<SubstituicaoAtiva> {
    const substituicao = await this.prisma.substituicao.findUnique({
      where: { id: substituicaoId },
      select: {
        id: true,
        clubeId: true,
        tipo: true,
        unidadeId: true,
        classeId: true,
        data: true,
        inicioEm: true,
        fimEm: true,
        fimEnvioEm: true,
        aparelhoHash: true,
        substitutoId: true,
        canceladoEm: true,
        unidade: { select: { ativa: true } },
        classe: { select: { clubeId: true, ativa: true } },
      },
    })
    if (!substituicao || substituicao.canceladoEm || !substituicao.aparelhoHash || !substituicao.substitutoId) {
      throw linkEncerrado()
    }
    const prazo = operacao === 'LEITURA' ? substituicao.fimEm : substituicao.fimEnvioEm
    if (agora < substituicao.inicioEm || agora >= prazo) throw linkEncerrado()
    if (!(await this.alvoAtivo(substituicao))) throw linkEncerrado()
    return {
      substituicaoId: substituicao.id,
      usuarioId: substituicao.substitutoId,
      clubeId: substituicao.clubeId,
      papel: substituicao.tipo === 'CHAMADA' ? 'CONSELHEIRO' : 'INSTRUTOR',
      unidadeId: substituicao.unidadeId,
      classeId: substituicao.classeId,
      data: substituicao.data.toISOString().slice(0, 10),
    }
  }

  /** Unidade ativa; classe do clube, ou oficial ligada no clube (`ClasseClube.ativa ?? true`). */
  private async alvoAtivo(substituicao: {
    clubeId: string
    tipo: TipoSubstituicao
    classeId: string | null
    unidade: { ativa: boolean } | null
    classe: { clubeId: string | null; ativa: boolean } | null
  }): Promise<boolean> {
    if (substituicao.tipo === 'CHAMADA') return substituicao.unidade?.ativa === true
    const { classe, classeId } = substituicao
    if (!classe || !classeId || !classe.ativa) return false
    if (classe.clubeId !== null) return classe.clubeId === substituicao.clubeId
    const doClube = await this.prisma.classeClube.findUnique({
      where: { clubeId_classeId: { clubeId: substituicao.clubeId, classeId } },
      select: { ativa: true },
    })
    return doClube?.ativa ?? true
  }
}
