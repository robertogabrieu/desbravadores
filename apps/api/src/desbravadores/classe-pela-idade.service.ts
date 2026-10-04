import { Injectable, Logger } from '@nestjs/common'
import { anoClube as anoDoClube } from '@desbravadores/shared'
import { PrismaService } from '../comum/prisma/prisma.service'
import type { Prisma } from '../generated/prisma/client.js'
import { paraDataCivil } from './apoio'
import { DesbravadoresService, travarMatriculasDoDesbravador } from './desbravadores.service'
import { ServicoEscopo } from './escopo.service'

/**
 * Desbravador ativo sem nenhuma matrícula regular (de qualquer trilha) no ano que não seja desistência.
 * Quem tem uma — inclusive a escolhida pelo Adm fora da idade — não é tocado.
 */
function semClasseNoAno(clubeId: string, anoClube: number): Prisma.DesbravadorWhereInput {
  return {
    clubeId,
    tipo: 'DBV',
    ativo: true,
    matriculas: { none: { clubeId, anoClube, status: { not: 'DESISTIU' }, classe: { tipo: 'REGULAR' } } },
  }
}

/** Preenche a classe da idade de quem está sem classe regular no ano do clube; nunca troca uma existente. */
@Injectable()
export class ServicoClassePelaIdade {
  private readonly logger = new Logger(ServicoClassePelaIdade.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly desbravadores: DesbravadoresService,
  ) {}

  /**
   * Varredura de um clube; cada desbravador grava na própria transação. Erro num vai para o log e não para os
   * outros. `hoje` fixa a data civil (teste da virada). Devolve quantos matriculou.
   */
  async sincronizarClube(clubeId: string, hoje?: string): Promise<number> {
    const relogio = await this.escopo.relogio(clubeId)
    const ano = hoje ? anoDoClube(hoje, relogio.inicioAnoClube) : relogio.anoClube
    const candidatos = await this.prisma.desbravador.findMany({ where: semClasseNoAno(clubeId, ano), select: { id: true } })
    let matriculados = 0
    for (const { id } of candidatos) {
      try {
        if (await this.aplicar(clubeId, id, ano)) matriculados++
      } catch (erro) {
        this.logger.error(`Clube ${clubeId}, ficha ${id}: classe pela idade não aplicada: ${erro instanceof Error ? erro.message : String(erro)}`)
      }
    }
    return matriculados
  }

  /**
   * Sob a trava do desbravador, reconfere que ele segue sem classe no ano (o Adm pode ter matriculado depois da
   * leitura) e o matricula na classe da idade. Devolve se matriculou.
   */
  async aplicar(clubeId: string, dbvId: string, anoClube: number): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await travarMatriculasDoDesbravador(tx, dbvId)
      const dbv = await tx.desbravador.findFirst({
        where: { ...semClasseNoAno(clubeId, anoClube), id: dbvId },
        select: { nascimento: true },
      })
      if (!dbv) return false
      return this.desbravadores.matricularPelaIdade(tx, { clubeId, dbvId, nascimento: paraDataCivil(dbv.nascimento), anoClube })
    })
  }
}
