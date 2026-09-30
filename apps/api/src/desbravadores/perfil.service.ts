import { Injectable } from '@nestjs/common'
import type { PerfilDbvSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { PrismaService } from '../comum/prisma/prisma.service'
import { CalculoRanking } from '../ranking/calculo-ranking'
import { DesbravadoresService } from './desbravadores.service'
import { ServicoEscopo, type RelogioDoClube } from './escopo.service'

type Perfil = z.infer<typeof PerfilDbvSaida>

@Injectable()
export class ServicoPerfil {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly desbravadores: DesbravadoresService,
    private readonly calculo: CalculoRanking,
  ) {}

  /**
   * Quais destes desbravadores quem pede alcanca (SPEC 5.4): a regra do perfil, que o ranking
   * reusa para decidir nome completo, frequencia e `abrePerfil`.
   */
  async idsNoEscopo(sessao: SessaoLogada, relogio: RelogioDoClube, dbvIds: string[]): Promise<Set<string>> {
    const doPapel = await this.escopo.filtroDesbravadores(sessao, relogio)
    const alcancados = await this.prisma.desbravador.findMany({
      where: { clubeId: sessao.clubeId, AND: [doPapel, { id: { in: dbvIds } }] },
      select: { id: true },
    })
    return new Set(alcancados.map((dbv) => dbv.id))
  }

  async perfil(sessao: SessaoLogada, id: string): Promise<Perfil> {
    const { clubeId } = sessao
    const dbv = await this.desbravadores.obter(sessao, id)
    const relogio = await this.escopo.relogio(clubeId)
    const mes = relogio.hoje.slice(0, 7)
    const resumo = await this.calculo.resumoDoDbv(clubeId, id, mes)
    const ranking = dbv.tipo === 'DBV' && dbv.ativo ? await this.calculo.doMes(clubeId, mes, relogio.anoClube) : []
    const posicao = ranking.findIndex((entrada) => entrada.dbvId === id) + 1
    const investidas = await this.prisma.matriculaClasse.findMany({
      where: { clubeId, dbvId: id, status: 'INVESTIDA' },
      orderBy: { anoClube: 'asc' },
      select: { anoClube: true, classe: { select: SELECAO_REF_CLASSE } },
    })
    return {
      dbv,
      mes,
      posicaoMes: posicao > 0 ? posicao : null,
      pontosMes: resumo.pontos,
      frequenciaMes: resumo.frequencia,
      classesInvestidas: investidas.map((matricula) => ({ classe: refClasse(matricula.classe), anoClube: matricula.anoClube })),
    }
  }
}
