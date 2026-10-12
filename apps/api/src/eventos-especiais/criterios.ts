import type { GatilhoCriterio, Prisma } from '../generated/prisma/client.js'

/** Os dois critérios nascem com 0 ponto: o valor de cada evento vem do próprio evento, não do critério. */
const CRITERIOS_DE_EVENTO: { gatilho: GatilhoCriterio; nome: string }[] = [
  { gatilho: 'EVENTO_ESPECIAL_PARTICIPACAO', nome: 'Participação em evento especial' },
  { gatilho: 'EVENTO_ESPECIAL_UNIFORME', nome: 'Uniforme em evento especial' },
]

/**
 * Os dois critérios padrão do evento especial, idempotente: o padrão do gatilho que já existe é reaproveitado;
 * nome tomado por critério não padrão ganha " 2", " 3"… Chamado ao concluir a primeira lista, o que serve ao clube
 * novo e ao que já existia.
 */
export async function garantirCriteriosDeEvento(tx: Prisma.TransactionClient, clubeId: string): Promise<void> {
  // Serializa quem garante ao mesmo tempo (duas conclusões): a segunda já enxerga o que a primeira criou.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`criterios-evento-especial:${clubeId}`}, 0))`
  for (const criterio of CRITERIOS_DE_EVENTO) {
    const existente = await tx.criterioRanking.findFirst({ where: { clubeId, gatilho: criterio.gatilho, padrao: true }, select: { id: true } })
    if (existente) continue
    const maior = await tx.criterioRanking.aggregate({ where: { clubeId }, _max: { ordem: true } })
    await tx.criterioRanking.create({
      data: {
        clubeId,
        nome: await nomeLivre(tx, clubeId, criterio.nome),
        pontos: 0,
        ativo: true,
        ordem: (maior._max.ordem ?? 0) + 1,
        gatilho: criterio.gatilho,
        lancadoPor: 'ADM',
        padrao: true,
      },
    })
  }
}

async function nomeLivre(tx: Prisma.TransactionClient, clubeId: string, nome: string): Promise<string> {
  const tomados = new Set(
    (await tx.criterioRanking.findMany({ where: { clubeId, nome: { startsWith: nome } }, select: { nome: true } })).map((criterio) => criterio.nome),
  )
  let candidato = nome
  for (let sufixo = 2; tomados.has(candidato); sufixo++) candidato = `${nome} ${sufixo}`
  return candidato
}
