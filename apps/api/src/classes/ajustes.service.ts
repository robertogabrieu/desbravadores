import { Injectable } from '@nestjs/common'
import type { ClasseClubeEditarEntrada, ClasseDetalheSaida, RequisitoAjusteEntrada } from '@desbravadores/shared'
import { anoClube, hojeNoFuso } from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import type { Prisma, QuemMonta } from '../generated/prisma/client.js'
import { ServicoMontagem } from '../cronogramas/montagem/servico-montagem'
import { ClassesService } from './classes.service'
import { comParDeClasses, temParAtivo } from './par-regular-avancada'

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
      if (entrada.ativa === true) await this.completarVinculosDoPar(tx, clubeId, classeId)
      if (entrada.quemMontaCronograma !== undefined) await this.repassarQuemMontaParaAvancada(tx, clubeId, classeId, entrada.quemMontaCronograma)
    })
    return this.classes.detalhar(clubeId, classeId)
  }

  /**
   * Ativar uma classe pode formar par com a do outro lado: os instrutores de um lado ganham o vinculo do outro,
   * porque o escopo confia no vinculo gravado.
   */
  private async completarVinculosDoPar(tx: Prisma.TransactionClient, clubeId: string, classeId: string): Promise<void> {
    const daqui = [{ clubeId: null }, { clubeId }]
    const classe = await tx.classe.findFirstOrThrow({
      where: { id: classeId, OR: daqui },
      select: { classeBaseId: true, avancadas: { where: { OR: daqui }, select: { id: true } } },
    })
    const doPar = [classeId, ...(classe.classeBaseId ? [classe.classeBaseId] : []), ...classe.avancadas.map((avancada) => avancada.id)]
    const vinculos = await tx.vinculo.findMany({
      where: { clubeId, papel: 'INSTRUTOR', classes: { some: { classeId: { in: doPar } } } },
      select: { id: true, classes: { select: { classeId: true } } },
    })
    for (const vinculo of vinculos) {
      const gravadas = vinculo.classes.map((ligacao) => ligacao.classeId)
      const completas = await comParDeClasses(tx, clubeId, gravadas)
      const faltam = completas.filter((id) => !gravadas.includes(id))
      if (faltam.length > 0) await tx.vinculoClasse.createMany({ data: faltam.map((id) => ({ vinculoId: vinculo.id, classeId: id })), skipDuplicates: true })
    }
  }

  /** A avancada segue a regular em quem monta, salvo com a regular desativada; `ativa` continua de cada uma. */
  private async repassarQuemMontaParaAvancada(
    tx: Prisma.TransactionClient,
    clubeId: string,
    regularId: string,
    quemMontaCronograma: QuemMonta,
  ): Promise<void> {
    // Regular desativada no clube: o par está desfeito e a avançada guarda o "quem monta" que ela mesma escolheu.
    const daRegular = await tx.classeClube.findUnique({ where: { clubeId_classeId: { clubeId, classeId: regularId } }, select: { ativa: true } })
    if (daRegular?.ativa === false) return
    const avancadas = await tx.classe.findMany({
      where: { tipo: 'AVANCADA', trilha: 'INDIVIDUAL', classeBaseId: regularId, OR: [{ clubeId: null }, { clubeId }] },
      select: { id: true },
    })
    for (const { id } of avancadas) {
      await tx.classeClube.upsert({
        where: { clubeId_classeId: { clubeId, classeId: id } },
        create: { clubeId, classeId: id, quemMontaCronograma },
        update: { quemMontaCronograma },
      })
    }
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
