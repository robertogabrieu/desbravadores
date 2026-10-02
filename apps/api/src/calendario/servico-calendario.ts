import { Injectable } from '@nestjs/common'
import { datasDoIntervalo, situacaoDaData, type EventoDoCalendario, type SituacaoDeData } from '@desbravadores/shared'
import { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'

/** Leitura do calendario do clube; quem escreve eventos e a Fase 3. */
@Injectable()
export class ServicoCalendario {
  constructor(private readonly prisma: PrismaService) {}

  /** Situacao de cada data de `inicio` a `fim` (inclusive), com todas as datas do intervalo presentes. */
  async situacoes(clubeId: string, inicio: string, fim: string): Promise<Map<string, SituacaoDeData>> {
    const [configuracao, eventos] = await Promise.all([
      this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId }, select: { diaReuniao: true } }),
      this.prisma.eventoCalendario.findMany({
        where: { clubeId, removidoEm: null, inicio: { lte: daDataCivil(fim) }, fim: { gte: daDataCivil(inicio) } },
        select: {
          nome: true, tipo: true, inicio: true, fim: true, horario: true, local: true,
          temReuniao: true, temClasse: true, bomParaCampo: true,
        },
      }),
    ])
    const doCalendario: EventoDoCalendario[] = eventos.map((evento) => ({
      ...evento,
      inicio: paraDataCivil(evento.inicio),
      fim: paraDataCivil(evento.fim),
    }))
    return new Map(datasDoIntervalo(inicio, fim).map((data) => [data, situacaoDaData(data, configuracao.diaReuniao, doCalendario)]))
  }
}
