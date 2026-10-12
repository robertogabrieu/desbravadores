import { Injectable } from '@nestjs/common'
import type { ClasseClubeEditarEntrada, ClasseDetalheSaida, RequisitoAjusteEntrada } from '@desbravadores/shared'
import { anoClube, hojeNoFuso } from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import type { Prisma, QuemMonta } from '../generated/prisma/client.js'
import { ServicoMontagem } from '../cronogramas/montagem/servico-montagem'
import { ClassesService } from './classes.service'
import { avancadaPareadaDe, completarVinculosDoPar, temParAtivo } from './par-regular-avancada'

type Detalhe = z.infer<typeof ClasseDetalheSaida>

const CLASSE_NAO_ENCONTRADA = 'Classe não encontrada.'

@Injectable()
export class AjustesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classes: ClassesService,
    private readonly montagem: ServicoMontagem,
  ) {}

  /** Ativa/desativa a classe no clube e escolhe quem monta o cronograma; desativar exige ninguem cursando. */
  async editarClasse(clubeId: string, classeId: string, entrada: z.infer<typeof ClasseClubeEditarEntrada>): Promise<Detalhe> {
    const classe = await this.prisma.classe.findFirst({
      where: { id: classeId, OR: [{ clubeId: null }, { clubeId }] },
      select: { id: true, nome: true, tipo: true, trilha: true, classeBase: { select: { nome: true } } },
    })
    if (!classe) throw new ErroApp('NAO_ENCONTRADO', CLASSE_NAO_ENCONTRADA)
    if (entrada.quemMontaCronograma !== undefined && classe.classeBase && (await temParAtivo(this.prisma, clubeId, classe.id))) {
      throw new ErroApp('VALIDACAO', `Altere em ${classe.classeBase.nome}: a avançada segue a regular.`)
    }

    if (entrada.ativa === false) await this.exigirSemMatriculaCursando(clubeId, classe)

    await this.prisma.$transaction(async (tx) => {
      await tx.classeClube.upsert({
        where: { clubeId_classeId: { clubeId, classeId } },
        create: { clubeId, classeId, ativa: entrada.ativa ?? true, quemMontaCronograma: entrada.quemMontaCronograma ?? 'ADM' },
        update: { ativa: entrada.ativa, quemMontaCronograma: entrada.quemMontaCronograma },
      })
      if (entrada.ativa === true) await completarVinculosDoPar(tx, clubeId, await this.classesDoPar(tx, clubeId, classeId))
      if (entrada.quemMontaCronograma !== undefined) await this.repassarQuemMontaParaAvancada(tx, clubeId, classeId, entrada.quemMontaCronograma)
    })
    return this.classes.detalhar(clubeId, classeId)
  }

  /** A classe, a regular dela e as avançadas dela: ativar a classe pode formar par com qualquer uma. */
  private async classesDoPar(tx: Prisma.TransactionClient, clubeId: string, classeId: string): Promise<string[]> {
    const daqui = [{ clubeId: null }, { clubeId }]
    const classe = await tx.classe.findFirstOrThrow({
      where: { id: classeId, OR: daqui },
      select: { classeBaseId: true, avancadas: { where: { OR: daqui }, select: { id: true } } },
    })
    return [classeId, ...(classe.classeBaseId ? [classe.classeBaseId] : []), ...classe.avancadas.map((avancada) => avancada.id)]
  }

  /** A avançada pareada segue a regular em quem monta; sem par, a avançada guarda o próprio valor. `ativa` continua de cada uma. */
  private async repassarQuemMontaParaAvancada(
    tx: Prisma.TransactionClient,
    clubeId: string,
    regularId: string,
    quemMontaCronograma: QuemMonta,
  ): Promise<void> {
    const avancada = await avancadaPareadaDe(tx, clubeId, regularId)
    if (!avancada) return
    await tx.classeClube.upsert({
      where: { clubeId_classeId: { clubeId, classeId: avancada.id } },
      create: { clubeId, classeId: avancada.id, quemMontaCronograma },
      update: { quemMontaCronograma },
    })
  }

  /** `null` volta o campo ao oficial; ausente mantem o que o clube ja tinha. Sem nenhum ajuste, a linha fica com os dois campos nulos (nunca é apagada). */
  async ajustarRequisito(clubeId: string, requisitoId: string, entrada: z.infer<typeof RequisitoAjusteEntrada>): Promise<Detalhe> {
    const requisito = await this.prisma.requisito.findFirst({
      where: { id: requisitoId, secao: { classe: { OR: [{ clubeId: null }, { clubeId }] } } },
      select: { secao: { select: { classeId: true } } },
    })
    if (!requisito) throw new ErroApp('NAO_ENCONTRADO', 'Requisito não encontrado.')

    const atual = await this.prisma.requisitoAjuste.findUnique({ where: { clubeId_requisitoId: { clubeId, requisitoId } } })
    const ativo = entrada.ativo === undefined ? (atual?.ativo ?? null) : entrada.ativo
    const campo = entrada.campo === undefined ? (atual?.campo ?? null) : entrada.campo

    await this.prisma.$transaction(async (tx) => {
      await tx.requisitoAjuste.upsert({
        where: { clubeId_requisitoId: { clubeId, requisitoId } },
        create: { clubeId, requisitoId, ativo, campo },
        update: { ativo, campo },
      })
      if (ativo === false) await this.montagem.retirarRequisitoDoClube(tx, clubeId, requisitoId)
    })
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
