import { Injectable } from '@nestjs/common'
import type { ProgressoDbvSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo, type RelogioDoClube } from '../desbravadores/escopo.service'
import { ServicoPontos } from '../pontos/servico-pontos'
import { ehViolacaoUnica, exigirDataDoAnoCorrente, jaConcluido } from './conclusoes'
import { ServicoProgresso } from './servico-progresso'

type ProgressoDbv = z.infer<typeof ProgressoDbvSaida>

const REQUISITO_NAO_ENCONTRADO = 'Requisito não encontrado.'

/** Marcar e desmarcar requisito fora da aula (F8); os pontos seguem B7. */
@Injectable()
export class RequisitosDbvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly progresso: ServicoProgresso,
    private readonly pontos: ServicoPontos,
  ) {}

  async marcar(sessao: SessaoLogada, dbvId: string, requisitoId: string, concluidoEm: string): Promise<ProgressoDbv> {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const dbv = await this.exigirAlcance(sessao, relogio, dbvId, requisitoId, true)
    exigirDataDoAnoCorrente(relogio, concluidoEm)

    try {
      await this.prisma.$transaction(async (tx) => {
        const ativa = await tx.requisitoConcluido.findFirst({ where: { clubeId, dbvId, requisitoId, removidoEm: null } })
        if (ativa) throw jaConcluido(ativa.concluidoEm)
        await tx.requisitoConcluido.create({
          data: { clubeId, dbvId, requisitoId, concluidoEm: daDataCivil(concluidoEm), marcadoPorId: sessao.usuarioId },
        })
        if (dbv.tipo !== 'DBV') return
        const criterio = await tx.criterioRanking.findFirst({ where: { clubeId, gatilho: 'REQUISITO', padrao: true, ativo: true } })
        if (!criterio) return
        await this.pontos.sincronizar(tx, {
          clubeId,
          dbvId,
          origemTipo: 'REQUISITO',
          origemId: `${dbvId}:${requisitoId}`,
          data: concluidoEm,
          devidos: [{ criterioId: criterio.id, pontos: criterio.pontos }],
          lancadoPorId: sessao.usuarioId,
        })
      })
    } catch (erro) {
      if (ehViolacaoUnica(erro)) throw new ErroApp('CONFLITO', 'Este requisito já foi concluído.')
      throw erro
    }
    return this.progresso.progressoDoDbv(sessao, dbvId)
  }

  /** Remove a conclusao ativa, seja qual for a origem (aula ou marcacao avulsa), e estorna os pontos. */
  async desmarcar(sessao: SessaoLogada, dbvId: string, requisitoId: string): Promise<ProgressoDbv> {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const dbv = await this.exigirAlcance(sessao, relogio, dbvId, requisitoId, false)

    await this.prisma.$transaction(async (tx) => {
      await tx.requisitoConcluido.updateMany({
        where: { clubeId, dbvId, requisitoId, removidoEm: null },
        data: { removidoEm: new Date(), removidoPorId: sessao.usuarioId },
      })
      if (dbv.tipo !== 'DBV') return
      await this.pontos.sincronizar(tx, {
        clubeId,
        dbvId,
        origemTipo: 'REQUISITO',
        origemId: `${dbvId}:${requisitoId}`,
        data: relogio.hoje,
        devidos: [],
        lancadoPorId: sessao.usuarioId,
      })
    })
    return this.progresso.progressoDoDbv(sessao, dbvId)
  }

  /**
   * F8: o DBV precisa estar no escopo de quem pede e matriculado, no ano, na classe do requisito;
   * o instrutor precisa ser dessa classe. Qualquer falha e 404.
   */
  private async exigirAlcance(
    sessao: SessaoLogada,
    relogio: RelogioDoClube,
    dbvId: string,
    requisitoId: string,
    exigirAtivo: boolean,
  ): Promise<{ id: string; tipo: 'DBV' | 'LIDER' }> {
    const { clubeId } = sessao
    const dbv = await this.progresso.exigirDbvNoEscopo(sessao, relogio, dbvId)
    const requisito = await this.prisma.requisito.findUnique({
      where: { id: requisitoId },
      select: { secao: { select: { classeId: true } } },
    })
    if (!requisito) throw new ErroApp('NAO_ENCONTRADO', REQUISITO_NAO_ENCONTRADO)
    const { classeId } = requisito.secao
    if (sessao.papel === 'INSTRUTOR' && !(await this.escopo.classesDoInstrutor(sessao)).includes(classeId)) {
      throw new ErroApp('NAO_ENCONTRADO', REQUISITO_NAO_ENCONTRADO)
    }
    const matricula = await this.prisma.matriculaClasse.findFirst({
      where: { clubeId, dbvId, classeId, anoClube: relogio.anoClube, status: { not: 'DESISTIU' } },
      select: { id: true },
    })
    if (!matricula) throw new ErroApp('NAO_ENCONTRADO', REQUISITO_NAO_ENCONTRADO)
    if (exigirAtivo) {
      const ativo = (await this.progresso.secoesAtivas(clubeId, classeId)).some((secao) => secao.requisitos.some((r) => r.id === requisitoId))
      if (!ativo) throw new ErroApp('NAO_ENCONTRADO', REQUISITO_NAO_ENCONTRADO)
    }
    return dbv
  }
}
