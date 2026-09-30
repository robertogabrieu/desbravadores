import { Injectable } from '@nestjs/common'
import type { ClasseClubeEditarEntrada, ClasseDetalheSaida, RequisitoAjusteEntrada } from '@desbravadores/shared'
import { anoClube, hojeNoFuso } from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ClassesService } from './classes.service'

type Detalhe = z.infer<typeof ClasseDetalheSaida>

const CLASSE_NAO_ENCONTRADA = 'Classe não encontrada.'

@Injectable()
export class AjustesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classes: ClassesService,
  ) {}

  /** Ativa/desativa a classe no clube e escolhe quem monta o cronograma; desativar exige ninguem cursando. */
  async editarClasse(clubeId: string, classeId: string, entrada: z.infer<typeof ClasseClubeEditarEntrada>): Promise<Detalhe> {
    const classe = await this.prisma.classe.findFirst({
      where: { id: classeId, OR: [{ clubeId: null }, { clubeId }] },
      select: { id: true, nome: true },
    })
    if (!classe) throw new ErroApp('NAO_ENCONTRADO', CLASSE_NAO_ENCONTRADA)

    if (entrada.ativa === false) await this.exigirSemMatriculaCursando(clubeId, classe)

    await this.prisma.classeClube.upsert({
      where: { clubeId_classeId: { clubeId, classeId } },
      create: { clubeId, classeId, ativa: entrada.ativa ?? true, quemMontaCronograma: entrada.quemMontaCronograma ?? 'ADM' },
      update: { ativa: entrada.ativa, quemMontaCronograma: entrada.quemMontaCronograma },
    })
    return this.classes.detalhar(clubeId, classeId)
  }

  /** `null` volta o campo ao oficial; ausente mantem o que o clube ja tinha. Sem nenhum ajuste, a linha some. */
  async ajustarRequisito(clubeId: string, requisitoId: string, entrada: z.infer<typeof RequisitoAjusteEntrada>): Promise<Detalhe> {
    const requisito = await this.prisma.requisito.findFirst({
      where: { id: requisitoId, secao: { classe: { OR: [{ clubeId: null }, { clubeId }] } } },
      select: { secao: { select: { classeId: true } } },
    })
    if (!requisito) throw new ErroApp('NAO_ENCONTRADO', 'Requisito não encontrado.')

    const atual = await this.prisma.requisitoAjuste.findUnique({ where: { clubeId_requisitoId: { clubeId, requisitoId } } })
    const ativo = entrada.ativo === undefined ? (atual?.ativo ?? null) : entrada.ativo
    const campo = entrada.campo === undefined ? (atual?.campo ?? null) : entrada.campo

    if (ativo === null && campo === null) {
      await this.prisma.requisitoAjuste.deleteMany({ where: { clubeId, requisitoId } })
    } else {
      await this.prisma.requisitoAjuste.upsert({
        where: { clubeId_requisitoId: { clubeId, requisitoId } },
        create: { clubeId, requisitoId, ativo, campo },
        update: { ativo, campo },
      })
    }
    return this.classes.detalhar(clubeId, requisito.secao.classeId)
  }

  private async exigirSemMatriculaCursando(clubeId: string, classe: { id: string; nome: string }): Promise<void> {
    const configuracao = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId } })
    const ano = anoClube(hojeNoFuso(configuracao.fuso, new Date()), configuracao.inicioAnoClube)
    const cursando = await this.prisma.matriculaClasse.count({
      where: { clubeId, classeId: classe.id, anoClube: ano, status: 'CURSANDO' },
    })
    if (cursando > 0) {
      throw new ErroApp('REGRA', `Há desbravadores cursando ${classe.nome}. Encerre as matrículas antes de desativar a classe.`)
    }
  }
}
