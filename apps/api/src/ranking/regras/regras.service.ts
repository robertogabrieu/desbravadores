import { Injectable } from '@nestjs/common'
import { GatilhoDeRegraSchema, GATILHOS_DE_REGRA, hojeNoFuso, type RegraEntrada, type RegraSaida, type RegrasSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { ServicoEventos } from '../../calendario/servico-eventos'
import { garantirCriterios } from '../../classe-biblica/criterios'
import type { SessaoLogada } from '../../comum/decorators/sessao.decorator'
import { ErroApp } from '../../comum/erros'
import { PrismaService } from '../../comum/prisma/prisma.service'
import type { Prisma } from '../../generated/prisma/client.js'
import { garantirCriteriosBasicos } from './criterios-basicos'

type Regra = z.infer<typeof RegraSaida>
type Eventos = z.infer<typeof RegrasSaida>['eventos']

@Injectable()
export class ServicoRegras {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: ServicoEventos,
  ) {}

  async listar(sessao: SessaoLogada): Promise<z.infer<typeof RegrasSaida>> {
    if (sessao.papel !== 'ADM') throw new ErroApp('SEM_PERMISSAO', 'Só o Adm vê as regras de pontuação.')
    const regras = await this.prisma.$transaction(async (tx) => {
      await garantirLinhas(tx, sessao.clubeId)
      return lerRegras(tx, sessao.clubeId)
    })
    return { regras, eventos: await this.eventosDoAno(sessao.clubeId) }
  }

  /** Só o critério muda: os lançamentos já feitos ficam com os pontos de quando foram lançados. */
  async alterar(sessao: SessaoLogada, gatilho: string, entrada: z.infer<typeof RegraEntrada>): Promise<Regra> {
    const regra = GatilhoDeRegraSchema.safeParse(gatilho)
    if (!regra.success) throw new ErroApp('NAO_ENCONTRADO', 'Regra não encontrada.')
    const { clubeId } = sessao
    return this.prisma.$transaction(async (tx) => {
      await garantirLinhas(tx, clubeId)
      const { count } = await tx.criterioRanking.updateMany({
        where: { clubeId, gatilho: regra.data, padrao: true },
        data: { pontos: entrada.pontos, ativo: entrada.ativo },
      })
      if (count === 0) throw new ErroApp('NAO_ENCONTRADO', 'Regra não encontrada.')
      return { gatilho: regra.data, pontos: entrada.pontos, ativo: entrada.ativo }
    })
  }

  /** Eventos especiais do ano civil corrente; `foram` só existe depois que a lista de presença foi concluída. */
  private async eventosDoAno(clubeId: string): Promise<Eventos> {
    const { fuso } = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId }, select: { fuso: true } })
    const ano = Number(hojeNoFuso(fuso, new Date()).slice(0, 4))
    const calendario = await this.eventos.doAno(clubeId, ano, true)
    return calendario.eventos
      .filter((evento) => evento.tipo === 'EVENTO_ESPECIAL')
      .map((evento) => {
        const concluida = evento.lista?.concluidaEm != null
        return {
          id: evento.id,
          nome: evento.nome,
          inicio: evento.inicio,
          fim: evento.fim,
          uniforme: evento.uniforme ?? null,
          pontosParticipacao: evento.pontosParticipacao ?? null,
          pontosUniforme: evento.pontosUniforme ?? null,
          listaConcluida: concluida,
          foram: concluida ? (evento.lista?.foram ?? 0) : null,
        }
      })
  }
}

async function garantirLinhas(tx: Prisma.TransactionClient, clubeId: string): Promise<void> {
  await garantirCriteriosBasicos(tx, clubeId)
  await garantirCriterios(tx, clubeId)
}

async function lerRegras(tx: Prisma.TransactionClient, clubeId: string): Promise<Regra[]> {
  const criterios = await tx.criterioRanking.findMany({
    where: { clubeId, padrao: true, gatilho: { in: [...GATILHOS_DE_REGRA] } },
    select: { gatilho: true, pontos: true, ativo: true },
  })
  return GATILHOS_DE_REGRA.flatMap((gatilho) => {
    const criterio = criterios.find((item) => item.gatilho === gatilho)
    return criterio ? [{ gatilho, pontos: criterio.pontos, ativo: criterio.ativo }] : []
  })
}
