import type { GatilhoCriterio, Prisma } from '../generated/prisma/client.js'

const CRITERIOS_CB: { gatilho: GatilhoCriterio; nome: string; pontos: number }[] = [
  { gatilho: 'CLASSE_BIBLICA_PRESENCA', nome: 'Presença na Classe Bíblica', pontos: 10 },
  { gatilho: 'CLASSE_BIBLICA_PARTICIPACAO', nome: 'Participou ativamente da Classe Bíblica', pontos: 5 },
]

/**
 * Os dois critérios padrão da Classe Bíblica (regra 11), idempotente: o padrão do gatilho que já
 * existe é reaproveitado; nome tomado por critério não padrão ganha " (Classe Bíblica)".
 */
export async function garantirCriterios(tx: Prisma.TransactionClient, clubeId: string): Promise<void> {
  // Serializa quem garante ao mesmo tempo (terminar e envio de chamada): o segundo já enxerga o que o primeiro criou.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`criterios-classe-biblica:${clubeId}`}, 0))`
  for (const criterio of CRITERIOS_CB) {
    const existente = await tx.criterioRanking.findFirst({ where: { clubeId, gatilho: criterio.gatilho, padrao: true }, select: { id: true } })
    if (existente) continue
    const tomado = await tx.criterioRanking.findFirst({ where: { clubeId, nome: criterio.nome }, select: { id: true } })
    const maior = await tx.criterioRanking.aggregate({ where: { clubeId }, _max: { ordem: true } })
    await tx.criterioRanking.create({
      data: {
        clubeId,
        nome: tomado ? `${criterio.nome} (Classe Bíblica)` : criterio.nome,
        pontos: criterio.pontos,
        ativo: true,
        ordem: (maior._max.ordem ?? 0) + 1,
        gatilho: criterio.gatilho,
        lancadoPor: 'ADM',
        padrao: true,
      },
    })
  }
}
