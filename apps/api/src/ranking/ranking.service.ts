import { Injectable } from '@nestjs/common'
import type { RankingFiltro, RankingSaida, RankingUnidadesSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoPerfil } from '../desbravadores/perfil.service'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import { CalculoRanking } from './calculo-ranking'

@Injectable()
export class RankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly perfil: ServicoPerfil,
    private readonly calculo: CalculoRanking,
  ) {}

  async ranking(sessao: SessaoLogada, filtro: z.infer<typeof RankingFiltro>): Promise<z.infer<typeof RankingSaida>> {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const mes = filtro.mes ?? relogio.hoje.slice(0, 7)
    if (filtro.unidadeId) {
      const unidade = await this.prisma.unidade.findFirst({ where: { id: filtro.unidadeId, clubeId }, select: { id: true } })
      if (!unidade) throw new ErroApp('NAO_ENCONTRADO', 'Unidade não encontrada.')
    }
    const entradas = await this.calculo.doMes(clubeId, mes, relogio.anoClube, filtro.unidadeId)
    const noEscopo = await this.perfil.idsNoEscopo(sessao, relogio, entradas.map((entrada) => entrada.dbvId))
    const itens = entradas.map((entrada, indice) => {
      const abrePerfil = noEscopo.has(entrada.dbvId)
      return {
        posicao: indice + 1,
        dbvId: entrada.dbvId,
        nome: abrePerfil ? entrada.nome : entrada.nomePublico,
        unidade: entrada.unidade,
        classe: entrada.classe,
        pontos: entrada.pontos,
        frequencia: abrePerfil ? entrada.frequencia : null,
        abrePerfil,
      }
    })
    return { mes, itens }
  }

  async unidades(sessao: SessaoLogada, mes?: string): Promise<z.infer<typeof RankingUnidadesSaida>> {
    const relogio = await this.escopo.relogio(sessao.clubeId)
    const medias = await this.calculo.unidades(sessao.clubeId, mes ?? relogio.hoje.slice(0, 7), relogio.anoClube)
    return medias.map((media, indice) => ({ posicao: indice + 1, ...media }))
  }
}
