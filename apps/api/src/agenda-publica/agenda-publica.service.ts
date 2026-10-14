import { Injectable } from '@nestjs/common'
import { hojeNoFuso, JANELA_DO_CALENDARIO_EM_DIAS, type AgendaPublicaSaida } from '@desbravadores/shared'
import { ClubePorSlugService } from '../auth/clube-por-slug.service'
import { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { montarCompromissos } from './compromissos'

function somarDias(data: string, dias: number): string {
  return paraDataCivil(new Date(daDataCivil(data).getTime() + dias * 86_400_000))
}

/** A agenda do clube para quem não tem login: só o que o contrato público permite. */
@Injectable()
export class AgendaPublicaService {
  constructor(
    private readonly clubes: ClubePorSlugService,
    private readonly prisma: PrismaService,
  ) {}

  async ver(slug: string, agora = new Date()): Promise<AgendaPublicaSaida> {
    const { clubeId, nome } = await this.clubes.resolver(slug)
    const configuracao = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } })
    const hoje = hojeNoFuso(configuracao.fuso, agora)
    const fimDaJanela = somarDias(hoje, JANELA_DO_CALENDARIO_EM_DIAS)
    const eventos = await this.prisma.eventoCalendario.findMany({
      where: {
        clubeId,
        removidoEm: null,
        tipo: { not: 'CLASSE_BIBLICA' },
        inicio: { lte: daDataCivil(fimDaJanela) },
        fim: { gte: daDataCivil(hoje) },
      },
      select: {
        nome: true,
        tipo: true,
        inicio: true,
        fim: true,
        horario: true,
        local: true,
        temReuniao: true,
        temClasse: true,
        bomParaCampo: true,
        uniforme: true,
      },
    })
    const compromissos = montarCompromissos({
      hoje,
      fimDaJanela,
      diaReuniao: configuracao.diaReuniao,
      horaReuniao: configuracao.horaReuniao,
      localReuniaoPadrao: configuracao.localReuniaoPadrao,
      eventos: eventos.map((evento) => ({ ...evento, inicio: paraDataCivil(evento.inicio), fim: paraDataCivil(evento.fim) })),
    })
    return { clube: { nome }, hoje, compromissos }
  }
}
