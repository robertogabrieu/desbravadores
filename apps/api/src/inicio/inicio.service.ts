import { Injectable } from '@nestjs/common'
import {
  feriasAte,
  horarioELocalDoDia,
  JANELA_DO_CALENDARIO_EM_DIAS,
  proximaReuniao,
  situacaoDaData,
  type InicioConselheiroFiltro,
  type InicioConselheiroSaida,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import { CalculoRanking } from '../ranking/calculo-ranking'

type Saida = z.infer<typeof InicioConselheiroSaida>

const TOTAL_DE_DESTAQUES = 3

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
      return { unidade: null, unidades, proximaReuniao: null, feriasAte: null, totalDbvs: 0, frequenciaMes: null, posicaoUnidade: null, destaques: [] }
    }

    const mes = relogio.hoje.slice(0, 7)
    const entradas = await this.calculo.doMes(clubeId, mes, relogio.anoClube, escolhida.id)
    const ranking = await this.calculo.unidades(clubeId, mes, relogio.anoClube)
    const posicaoNoRanking = ranking.findIndex((media) => media.unidade.id === escolhida.id)
    const calendario = await this.proximaReuniaoEFerias(clubeId, escolhida.id, relogio.hoje)
    return {
      unidade: escolhida,
      unidades,
      ...calendario,
      totalDbvs: entradas.length,
      frequenciaMes: await this.calculo.frequenciaDaUnidade(clubeId, escolhida.id, mes),
      posicaoUnidade: posicaoNoRanking < 0 ? null : { posicao: posicaoNoRanking + 1, total: ranking.length },
      destaques: entradas
        .map((entrada, indice) => ({ posicao: indice + 1, dbvId: entrada.dbvId, nome: entrada.nome, pontos: entrada.pontos }))
        .filter((destaque) => destaque.pontos > 0)
        .slice(0, TOTAL_DE_DESTAQUES),
    }
  }

  private async proximaReuniaoEFerias(clubeId: string, unidadeId: string, hoje: string): Promise<Pick<Saida, 'proximaReuniao' | 'feriasAte'>> {
    const configuracao = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } })
    const limite = paraDataCivil(new Date(daDataCivil(hoje).getTime() + JANELA_DO_CALENDARIO_EM_DIAS * 86_400_000))
    const eventos = (
      await this.prisma.eventoCalendario.findMany({
        where: { clubeId, removidoEm: null, inicio: { lte: daDataCivil(limite) }, fim: { gte: daDataCivil(hoje) } },
      })
    ).map((evento) => ({ ...evento, inicio: paraDataCivil(evento.inicio), fim: paraDataCivil(evento.fim) }))
    const fimDasFerias = feriasAte(hoje, configuracao.diaReuniao, eventos)
    const proxima = proximaReuniao(hoje, configuracao.diaReuniao, eventos)
    if (!proxima) return { proximaReuniao: null, feriasAte: fimDasFerias }

    const { horario, local } = horarioELocalDoDia(situacaoDaData(proxima.data, configuracao.diaReuniao, eventos), {
      horario: configuracao.horaReuniao,
      local: configuracao.localReuniaoPadrao,
    })
    const feitas = await this.prisma.reuniao.count({ where: { clubeId, unidadeId, data: daDataCivil(proxima.data) } })
    return {
      proximaReuniao: {
        data: proxima.data,
        horario,
        local,
        nome: proxima.extra?.nome ?? null,
        ehHoje: proxima.data === hoje,
        chamadaFeita: feitas > 0,
      },
      feriasAte: fimDasFerias,
    }
  }
}
