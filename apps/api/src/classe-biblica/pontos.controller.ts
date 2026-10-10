import { Body, Controller, Get, Patch } from '@nestjs/common'
import { GATILHOS_CB, PontosCBEntrada, type PontosCBSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { PrismaService } from '../comum/prisma/prisma.service'
import type { Prisma } from '../generated/prisma/client.js'
import { garantirCriterios } from './criterios'

type PontosCB = z.infer<typeof PontosCBSaida>

/** Seção "Pontos da Classe Bíblica" das Configurações do clube (regra 11, D15). */
@Controller('classe-biblica/pontos')
export class PontosController {
  constructor(private readonly prisma: PrismaService) {}

  @Pode('ranking.configurar')
  @Get()
  obter(@SessaoDoClube() sessao: SessaoLogada): Promise<PontosCB> {
    return this.prisma.$transaction(async (tx) => {
      await garantirCriterios(tx, sessao.clubeId)
      return lerPontos(tx, sessao.clubeId)
    })
  }

  /** Só o critério muda: os lançamentos já feitos ficam com os pontos de quando foram lançados. */
  @Pode('ranking.configurar')
  @Patch()
  alterar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Body(new ZodValidationPipe(PontosCBEntrada)) entrada: z.infer<typeof PontosCBEntrada>,
  ): Promise<PontosCB> {
    const { clubeId } = sessao
    return this.prisma.$transaction(async (tx) => {
      await garantirCriterios(tx, clubeId)
      for (const item of entrada.itens) {
        await tx.criterioRanking.updateMany({
          where: { clubeId, gatilho: item.gatilho, padrao: true },
          data: { pontos: item.pontos, ativo: item.ativo },
        })
      }
      return lerPontos(tx, clubeId)
    })
  }
}

async function lerPontos(tx: Prisma.TransactionClient, clubeId: string): Promise<PontosCB> {
  const criterios = await tx.criterioRanking.findMany({
    where: { clubeId, padrao: true, gatilho: { in: [...GATILHOS_CB] } },
    select: { gatilho: true, nome: true, pontos: true, ativo: true },
  })
  return {
    itens: GATILHOS_CB.flatMap((gatilho) => {
      const criterio = criterios.find((item) => item.gatilho === gatilho)
      return criterio ? [{ gatilho, nome: criterio.nome, pontos: criterio.pontos, ativo: criterio.ativo }] : []
    }),
  }
}
