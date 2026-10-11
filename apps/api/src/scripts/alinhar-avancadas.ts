import { parseArgs } from 'node:util'
import { avancadaComParAtivo } from '../classes/par-regular-avancada'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'

export interface ResultadoDoAlinhamento {
  clubes: number
  vinculosCriados: number
  vinculosRemovidos: number
  quemMontaAlterado: number
}

/**
 * Clube a clube, nos pares ativos, faz a avancada copiar a regular: os instrutores (VinculoClasse) e quem monta o cronograma.
 * Idempotente. Com `seco`, so conta o que mudaria. `clubeId` restringe a um clube.
 */
export async function alinharAvancadas(
  prisma: PrismaSistema,
  opcoes: { seco: boolean; clubeId?: string },
): Promise<ResultadoDoAlinhamento> {
  const clubes = await prisma.clube.findMany({ where: { id: opcoes.clubeId }, select: { id: true } })
  const resultado: ResultadoDoAlinhamento = { clubes: clubes.length, vinculosCriados: 0, vinculosRemovidos: 0, quemMontaAlterado: 0 }

  async function vinculosDe(clubeId: string, classeId: string): Promise<Set<string>> {
    const linhas = await prisma.vinculoClasse.findMany({ where: { classeId, vinculo: { clubeId } }, select: { vinculoId: true } })
    return new Set(linhas.map((linha) => linha.vinculoId))
  }

  for (const { id: clubeId } of clubes) {
    // So os pares ativos no sistema e neste clube; avancada ou regular desativada fica como esta.
    const avancadas = await prisma.classe.findMany({ where: avancadaComParAtivo(clubeId), select: { id: true, classeBaseId: true } })
    for (const avancada of avancadas) {
      if (!avancada.classeBaseId) continue
      const regularId = avancada.classeBaseId
      const daRegular = await vinculosDe(clubeId, regularId)
      const daAvancada = await vinculosDe(clubeId, avancada.id)
      const faltam = [...daRegular].filter((vinculoId) => !daAvancada.has(vinculoId))
      const sobram = [...daAvancada].filter((vinculoId) => !daRegular.has(vinculoId))
      resultado.vinculosCriados += faltam.length
      resultado.vinculosRemovidos += sobram.length
      if (!opcoes.seco) {
        await prisma.vinculoClasse.createMany({ data: faltam.map((vinculoId) => ({ vinculoId, classeId: avancada.id })) })
        await prisma.vinculoClasse.deleteMany({ where: { classeId: avancada.id, vinculoId: { in: sobram } } })
      }

      const [regularClube, avancadaClube] = await Promise.all([
        prisma.classeClube.findUnique({ where: { clubeId_classeId: { clubeId, classeId: regularId } } }),
        prisma.classeClube.findUnique({ where: { clubeId_classeId: { clubeId, classeId: avancada.id } } }),
      ])
      const quemMonta = regularClube?.quemMontaCronograma ?? 'ADM'
      if ((avancadaClube?.quemMontaCronograma ?? 'ADM') === quemMonta) continue
      resultado.quemMontaAlterado += 1
      if (opcoes.seco) continue
      await prisma.classeClube.upsert({
        where: { clubeId_classeId: { clubeId, classeId: avancada.id } },
        create: { clubeId, classeId: avancada.id, quemMontaCronograma: quemMonta },
        update: { quemMontaCronograma: quemMonta },
      })
    }
  }
  return resultado
}

async function principal(): Promise<void> {
  const { values } = parseArgs({ args: process.argv.slice(2), options: { seco: { type: 'boolean' }, clube: { type: 'string' } } })
  const seco = values.seco ?? false
  const prisma = new PrismaSistema()
  try {
    const r = await alinharAvancadas(prisma, { seco, clubeId: values.clube })
    const verbo = seco ? 'mudaria' : 'mudou'
    console.log(
      `${seco ? '[seco] ' : ''}${r.clubes} clube(s): ${verbo} ${r.vinculosCriados} vinculo(s) criado(s), ` +
        `${r.vinculosRemovidos} removido(s), quem monta em ${r.quemMontaAlterado} classe(s).`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  principal().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
}
