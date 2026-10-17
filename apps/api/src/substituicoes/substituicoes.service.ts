import { Injectable } from '@nestjs/common'
import { hojeNoFuso, type DatasElegiveis, type SubstituicaoDoAlvo, type SubstituicaoGerada } from '@desbravadores/shared'
import type { z } from 'zod'
import { ServicoCalendario } from '../calendario/servico-calendario'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { classesDoLink, regularDoLink } from '../classes/par-regular-avancada'
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

  async aberta(sessao: SessaoLogada, tipo: TipoSubstituicao, pedidoId: string): Promise<z.infer<typeof SubstituicaoDoAlvo>> {
    const alvoId = await this.alvoDoLink(sessao.clubeId, tipo, pedidoId)
    await this.exigirAlvo(sessao.clubeId, tipo, alvoId)
    const aberta = await this.prisma.substituicao.findFirst({
      where: { ...(await this.filtroDoAlvo(sessao.clubeId, tipo, alvoId)), ...abertaEm(new Date()) },
      orderBy: { criadoEm: 'desc' },
      include: { substituto: { select: { nome: true } } },
    })
    return aberta ? apresentar(aberta) : null
  }

  async gerar(sessao: SessaoLogada, tipo: TipoSubstituicao, pedidoId: string, data: string): Promise<z.infer<typeof SubstituicaoGerada>> {
    const { clubeId } = sessao
    const alvoId = await this.alvoDoLink(clubeId, tipo, pedidoId)
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
      // Trava a linha do alvo: outro gerar simultâneo espera este terminar e então cancela o link criado aqui.
      if (tipo === 'CHAMADA') await tx.$queryRaw`SELECT id FROM "Unidade" WHERE id = ${alvoId}::uuid FOR UPDATE`
      else await tx.$queryRaw`SELECT id FROM "Classe" WHERE id = ${alvoId}::uuid FOR UPDATE`
      await tx.substituicao.updateMany({
        where: { ...(await this.filtroDoAlvo(clubeId, tipo, alvoId)), ...abertaEm(agora) },
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
  async cancelar(sessao: SessaoLogada, tipo: TipoSubstituicao, pedidoId: string): Promise<void> {
    const { clubeId } = sessao
    const alvoId = await this.alvoDoLink(clubeId, tipo, pedidoId)
    await this.exigirAlvo(clubeId, tipo, alvoId)
    const agora = new Date()
    await this.prisma.substituicao.updateMany({
      where: { ...(await this.filtroDoAlvo(clubeId, tipo, alvoId)), ...abertaEm(agora) },
      data: { canceladoEm: agora, canceladoPorId: sessao.usuarioId },
    })
  }

  private async janelas(clubeId: string, tipo: TipoSubstituicao, agora: Date): Promise<Janela[]> {
    const clube = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId }, select: { fuso: true, horaReuniao: true } })
    const hoje = hojeNoFuso(clube.fuso, agora)
    const situacoes = await this.calendario.situacoes(clubeId, hoje, ultimoDiaElegivel(hoje))
    return janelasElegiveis(situacoes, tipo, clube, agora)
  }

  /** Regular e avançada (individual ou agrupadas) são lecionadas juntas: o link de qualquer uma é o da regular, que vale para as duas. */
  private async alvoDoLink(clubeId: string, tipo: TipoSubstituicao, pedidoId: string): Promise<string> {
    if (tipo !== 'CLASSE') return pedidoId
    return regularDoLink(this.prisma, clubeId, pedidoId)
  }

  /** Onde procurar link aberto: no link da classe, também o que nasceu antes na avançada do par. */
  private async filtroDoAlvo(clubeId: string, tipo: TipoSubstituicao, alvoId: string) {
    if (tipo !== 'CLASSE') return this.doAlvo(clubeId, tipo, alvoId)
    return { clubeId, tipo, unidadeId: null, classeId: { in: await classesDoLink(this.prisma, clubeId, alvoId) } }
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
