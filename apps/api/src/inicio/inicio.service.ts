import { Injectable } from '@nestjs/common'
import type { InicioConselheiroFiltro, InicioConselheiroSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import { CalculoRanking } from '../ranking/calculo-ranking'

type Saida = z.infer<typeof InicioConselheiroSaida>

const TOTAL_DE_DESTAQUES = 3

/** Primeira data a partir de `hoje` cujo dia da semana e `diaDaSemana` (0 = domingo). */
function proximaData(hoje: string, diaDaSemana: number): string {
  const data = daDataCivil(hoje)
  const espera = (diaDaSemana - data.getUTCDay() + 7) % 7
  data.setUTCDate(data.getUTCDate() + espera)
  return paraDataCivil(data)
}

@Injectable()
export class InicioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly calculo: CalculoRanking,
  ) {}

  async conselheiro(sessao: SessaoLogada, filtro: z.infer<typeof InicioConselheiroFiltro>): Promise<Saida> {
    if (sessao.papel !== 'CONSELHEIRO') throw new ErroApp('SEM_PERMISSAO', 'Esta tela é do conselheiro.')
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const unidadeIds = await this.escopo.unidadesDoConselheiro(sessao)
    const unidades = await this.prisma.unidade.findMany({
      where: { clubeId, id: { in: unidadeIds } },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    })
    const escolhida = filtro.unidadeId ? unidades.find((unidade) => unidade.id === filtro.unidadeId) : unidades[0]
    if (filtro.unidadeId && !escolhida) throw new ErroApp('NAO_ENCONTRADO', 'Unidade não encontrada.')
    if (!escolhida) {
      return { unidade: null, unidades, proximaReuniao: null, totalDbvs: 0, frequenciaMes: null, posicaoUnidade: null, destaques: [] }
    }

    const mes = relogio.hoje.slice(0, 7)
    const entradas = await this.calculo.doMes(clubeId, mes, relogio.anoClube, escolhida.id)
    const ranking = await this.calculo.unidades(clubeId, mes, relogio.anoClube)
    const posicaoNoRanking = ranking.findIndex((media) => media.unidade.id === escolhida.id)
    return {
      unidade: escolhida,
      unidades,
      proximaReuniao: await this.proximaReuniao(clubeId, escolhida.id, relogio.hoje),
      totalDbvs: entradas.length,
      frequenciaMes: await this.calculo.frequenciaDaUnidade(clubeId, escolhida.id, mes),
      posicaoUnidade: posicaoNoRanking < 0 ? null : { posicao: posicaoNoRanking + 1, total: ranking.length },
      destaques: entradas
        .map((entrada, indice) => ({ posicao: indice + 1, dbvId: entrada.dbvId, nome: entrada.nome, pontos: entrada.pontos }))
        .filter((destaque) => destaque.pontos > 0)
        .slice(0, TOTAL_DE_DESTAQUES),
    }
  }

  private async proximaReuniao(clubeId: string, unidadeId: string, hoje: string): Promise<Saida['proximaReuniao']> {
    const configuracao = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } })
    const data = proximaData(hoje, configuracao.diaReuniao)
    const feitas = await this.prisma.reuniao.count({ where: { clubeId, unidadeId, data: daDataCivil(data) } })
    return {
      data,
      horario: configuracao.horaReuniao,
      local: configuracao.localReuniaoPadrao,
      ehHoje: data === hoje,
      chamadaFeita: feitas > 0,
    }
  }
}
