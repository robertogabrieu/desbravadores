import { Injectable } from '@nestjs/common'
import { hojeNoFuso, type DatasElegiveis, type SubstituicaoDoAlvo, type SubstituicaoGerada } from '@desbravadores/shared'
import type { z } from 'zod'
import { ServicoCalendario } from '../calendario/servico-calendario'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { urlDoApp } from '../email/modelos'
import type { Substituicao, TipoSubstituicao } from '../generated/prisma/client.js'
import { gerarTokenOpaco, hashDoToken } from '../sessao/tokens'
import { alvoAtivo } from './alvo'
import { janelasElegiveis, ultimoDiaElegivel, type Janela } from './janela'

type Apresentada = NonNullable<z.infer<typeof SubstituicaoDoAlvo>>

/** Ciclo do link de substituição do lado do Adm: dias elegíveis, gerar, ler o aberto e cancelar. */
@Injectable()
export class SubstituicoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendario: ServicoCalendario,
  ) {}

  async datas(clubeId: string, tipo: TipoSubstituicao): Promise<z.infer<typeof DatasElegiveis>> {
    const janelas = await this.janelas(clubeId, tipo, new Date())
    return janelas.map((janela) => ({ data: janela.data, inicioEm: janela.inicioEm.toISOString(), fimEm: janela.fimEm.toISOString() }))
  }

  async aberta(sessao: SessaoLogada, tipo: TipoSubstituicao, alvoId: string): Promise<z.infer<typeof SubstituicaoDoAlvo>> {
    await this.exigirAlvo(sessao.clubeId, tipo, alvoId)
    const aberta = await this.prisma.substituicao.findFirst({
      where: { ...this.doAlvo(sessao.clubeId, tipo, alvoId), ...abertaEm(new Date()) },
      orderBy: { criadoEm: 'desc' },
      include: { substituto: { select: { nome: true } } },
    })
    return aberta ? apresentar(aberta) : null
  }

  async gerar(sessao: SessaoLogada, tipo: TipoSubstituicao, alvoId: string, data: string): Promise<z.infer<typeof SubstituicaoGerada>> {
    const { clubeId } = sessao
    await this.exigirAlvo(clubeId, tipo, alvoId)
    const agora = new Date()
    const janela = (await this.janelas(clubeId, tipo, agora)).find((elegivel) => elegivel.data === data)
    if (!janela) {
      const mensagem = tipo === 'CHAMADA' ? 'Escolha um dos dias com reunião.' : 'Escolha um dos dias com classe.'
      throw new ErroApp('VALIDACAO', mensagem, { data: mensagem })
    }

    const token = gerarTokenOpaco()
    const doAlvo = this.doAlvo(clubeId, tipo, alvoId)
    const criada = await this.prisma.$transaction(async (tx) => {
      await tx.substituicao.updateMany({
        where: { ...doAlvo, ...abertaEm(agora) },
        data: { canceladoEm: agora, canceladoPorId: sessao.usuarioId },
      })
      return tx.substituicao.create({
        data: {
          ...doAlvo,
          data: daDataCivil(janela.data),
          inicioEm: janela.inicioEm,
          fimEm: janela.fimEm,
          fimEnvioEm: janela.fimEnvioEm,
          tokenHash: hashDoToken(token),
          criadoPorId: sessao.usuarioId,
        },
      })
    })
    return { ...apresentar({ ...criada, substituto: null }), link: `${urlDoApp()}/substituto/${token}` }
  }

  /** Nada se apaga: o link cancelado fica com quem cancelou e quando. */
  async cancelar(sessao: SessaoLogada, tipo: TipoSubstituicao, alvoId: string): Promise<void> {
    const { clubeId } = sessao
    await this.exigirAlvo(clubeId, tipo, alvoId)
    const agora = new Date()
    await this.prisma.substituicao.updateMany({
      where: { ...this.doAlvo(clubeId, tipo, alvoId), ...abertaEm(agora) },
      data: { canceladoEm: agora, canceladoPorId: sessao.usuarioId },
    })
  }

  private async janelas(clubeId: string, tipo: TipoSubstituicao, agora: Date): Promise<Janela[]> {
    const clube = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId }, select: { fuso: true, horaReuniao: true } })
    const hoje = hojeNoFuso(clube.fuso, agora)
    const situacoes = await this.calendario.situacoes(clubeId, hoje, ultimoDiaElegivel(hoje))
    return janelasElegiveis(situacoes, tipo, clube, agora)
  }

  private doAlvo(clubeId: string, tipo: TipoSubstituicao, alvoId: string) {
    return { clubeId, tipo, unidadeId: tipo === 'CHAMADA' ? alvoId : null, classeId: tipo === 'CLASSE' ? alvoId : null }
  }

  private async exigirAlvo(clubeId: string, tipo: TipoSubstituicao, alvoId: string): Promise<void> {
    if (await alvoAtivo(this.prisma, clubeId, tipo, alvoId)) return
    throw new ErroApp('NAO_ENCONTRADO', tipo === 'CHAMADA' ? 'Unidade não encontrada.' : 'Classe não encontrada.')
  }
}

/** Aberto = não cancelado e com o fim do envio ainda por vir. */
function abertaEm(agora: Date) {
  return { canceladoEm: null, fimEnvioEm: { gt: agora } }
}

function apresentar(substituicao: Substituicao & { substituto: { nome: string } | null }): Apresentada {
  return {
    id: substituicao.id,
    data: paraDataCivil(substituicao.data),
    inicioEm: substituicao.inicioEm.toISOString(),
    fimEm: substituicao.fimEm.toISOString(),
    identificadaEm: substituicao.identificadaEm?.toISOString() ?? null,
    substituto: substituicao.identificadaEm && substituicao.substituto ? { nome: substituicao.substituto.nome } : null,
  }
}
