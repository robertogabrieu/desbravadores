import { Injectable } from '@nestjs/common'
import type { EspecialidadesDoDbvSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { nomeDoAutor } from '../comum/nome-do-autor'
import { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import { ServicoPontos } from '../pontos/servico-pontos'
import { ehViolacaoUnica, exigirDataDoAnoCorrente, jaConcluido } from '../progresso/conclusoes'
import { ServicoProgresso } from '../progresso/servico-progresso'

type EspecialidadesDoDbv = z.infer<typeof EspecialidadesDoDbvSaida>

/** Especialidades concluidas de um DBV: leitura e marcar/desmarcar fora da aula (F8, B7). */
@Injectable()
export class EspecialidadesDbvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly progresso: ServicoProgresso,
    private readonly pontos: ServicoPontos,
  ) {}

  async listar(sessao: SessaoLogada, dbvId: string): Promise<EspecialidadesDoDbv> {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    await this.progresso.exigirDbvNoEscopo(sessao, relogio, dbvId)
    const podeDesmarcar = sessao.papel !== 'CONSELHEIRO' && (await this.escopo.permissoes(sessao)).includes('requisito.marcar')
    const concluidas = await this.prisma.especialidadeConcluida.findMany({
      where: { clubeId, dbvId, removidoEm: null },
      orderBy: [{ concluidaEm: 'desc' }, { id: 'asc' }],
      select: { especialidadeId: true, concluidaEm: true, marcadoPor: { select: { nome: true, status: true } } },
    })
    return {
      dbvId,
      concluidas: concluidas.map((linha) => ({
        especialidadeId: linha.especialidadeId,
        concluidaEm: paraDataCivil(linha.concluidaEm),
        marcadoPor: nomeDoAutor(linha.marcadoPor),
        podeDesmarcar,
      })),
    }
  }

  async marcar(sessao: SessaoLogada, dbvId: string, especialidadeId: string, concluidaEm: string): Promise<EspecialidadesDoDbv> {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const dbv = await this.progresso.exigirDbvNoEscopo(sessao, relogio, dbvId)
    const especialidade = await this.prisma.especialidade.findFirst({
      where: { id: especialidadeId, ativa: true, OR: [{ clubeId: null }, { clubeId }] },
      select: { id: true },
    })
    if (!especialidade) throw new ErroApp('NAO_ENCONTRADO', 'Especialidade não encontrada.')
    exigirDataDoAnoCorrente(relogio, concluidaEm)

    try {
      await this.prisma.$transaction(async (tx) => {
        const ativa = await tx.especialidadeConcluida.findFirst({ where: { clubeId, dbvId, especialidadeId, removidoEm: null } })
        if (ativa) throw jaConcluido(ativa.concluidaEm)
        await tx.especialidadeConcluida.create({
          data: { clubeId, dbvId, especialidadeId, concluidaEm: daDataCivil(concluidaEm), marcadoPorId: sessao.usuarioId },
        })
        if (dbv.tipo !== 'DBV') return
        const criterio = await tx.criterioRanking.findFirst({ where: { clubeId, gatilho: 'ESPECIALIDADE', padrao: true, ativo: true } })
        if (!criterio) return
        await this.pontos.sincronizar(tx, {
          clubeId,
          dbvId,
          origemTipo: 'ESPECIALIDADE',
          origemId: `${dbvId}:${especialidadeId}`,
          data: concluidaEm,
          devidos: [{ criterioId: criterio.id, pontos: criterio.pontos }],
          lancadoPorId: sessao.usuarioId,
        })
      })
    } catch (erro) {
      if (ehViolacaoUnica(erro)) throw new ErroApp('CONFLITO', 'Esta especialidade já foi concluída.')
      throw erro
    }
    return this.listar(sessao, dbvId)
  }

  async desmarcar(sessao: SessaoLogada, dbvId: string, especialidadeId: string): Promise<EspecialidadesDoDbv> {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const dbv = await this.progresso.exigirDbvNoEscopo(sessao, relogio, dbvId)

    await this.prisma.$transaction(async (tx) => {
      await tx.especialidadeConcluida.updateMany({
        where: { clubeId, dbvId, especialidadeId, removidoEm: null },
        data: { removidoEm: new Date(), removidoPorId: sessao.usuarioId },
      })
      if (dbv.tipo !== 'DBV') return
      await this.pontos.sincronizar(tx, {
        clubeId,
        dbvId,
        origemTipo: 'ESPECIALIDADE',
        origemId: `${dbvId}:${especialidadeId}`,
        data: relogio.hoje,
        devidos: [],
        lancadoPorId: sessao.usuarioId,
      })
    })
    return this.listar(sessao, dbvId)
  }
}
