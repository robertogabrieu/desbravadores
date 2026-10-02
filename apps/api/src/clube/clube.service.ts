import { Injectable } from '@nestjs/common'
import type { ConfiguracaoClubeEntrada, ConfiguracaoClubeSaida } from '@desbravadores/shared'
import { hojeNoFuso } from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'

type Saida = z.infer<typeof ConfiguracaoClubeSaida>

const CAMPOS_DA_CONFIGURACAO = {
  diaReuniao: true,
  horaReuniao: true,
  localReuniaoPadrao: true,
  limiarFrequenciaAlerta: true,
  limiarProgressoAlerta: true,
  metaFrequencia: true,
  fuso: true,
  inicioAnoClube: true,
} as const

function diaDaSemana(data: string): number {
  return daDataCivil(data).getUTCDay()
}

@Injectable()
export class ClubeService {
  constructor(private readonly prisma: PrismaService) {}

  obter(clubeId: string): Promise<Saida> {
    return this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId }, select: CAMPOS_DA_CONFIGURACAO })
  }

  /** `fuso` e `inicioAnoClube` nao entram no contrato de entrada: ficam como estao. */
  async editar(clubeId: string, entrada: z.infer<typeof ConfiguracaoClubeEntrada>): Promise<Saida> {
    const atual = await this.obter(clubeId)
    if (entrada.diaReuniao !== undefined && entrada.diaReuniao !== atual.diaReuniao) {
      await this.exigirSemAulaNoDiaDeReuniao(clubeId, atual)
    }
    return this.prisma.configuracaoClube.update({ where: { clubeId }, data: entrada, select: CAMPOS_DA_CONFIGURACAO })
  }

  /** G9: classe individual futura e ativa no dia de reuniao de hoje impede trocar o dia. */
  private async exigirSemAulaNoDiaDeReuniao(clubeId: string, atual: Saida): Promise<void> {
    const hoje = hojeNoFuso(atual.fuso, new Date())
    const aulas = await this.prisma.aulaPlanejada.findMany({
      where: { clubeId, removidaEm: null, data: { gte: daDataCivil(hoje) }, cronograma: { classe: { trilha: 'INDIVIDUAL' } } },
      select: { data: true, cronograma: { select: { classe: { select: { nome: true, ordem: true } } } } },
    })
    const datasDasClasses = aulas.map((aula) => aula.data)
    const extrasComClasse = await this.prisma.eventoCalendario.findMany({
      where: { clubeId, removidoEm: null, tipo: 'REUNIAO_EXTRA', temClasse: true, inicio: { in: datasDasClasses } },
      select: { inicio: true },
    })
    const datasComExtra = new Set(extrasComClasse.map((extra) => paraDataCivil(extra.inicio)))
    const classes = new Map<string, number>()
    for (const aula of aulas) {
      const data = paraDataCivil(aula.data)
      if (diaDaSemana(data) !== atual.diaReuniao) continue
      if (datasComExtra.has(data)) continue
      const { nome, ordem } = aula.cronograma.classe
      classes.set(nome, ordem)
    }
    if (classes.size === 0) return
    const nomes = [...classes.entries()].sort((a, b) => a[1] - b[1]).map(([nome]) => nome)
    throw new ErroApp('REGRA', `Há classes marcadas no dia atual de reunião: ${nomes.join(', ')}. Mova-as antes.`)
  }
}
