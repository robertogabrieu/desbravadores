import type { GatilhoCriterio, Prisma } from '../generated/prisma/client.js'

const CRITERIOS_CB: { gatilho: GatilhoCriterio; nome: string; pontos: number }[] = [
  { gatilho: 'CLASSE_BIBLICA_PRESENCA', nome: 'Presença na Classe Bíblica', pontos: 10 },
  { gatilho: 'CLASSE_BIBLICA_PARTICIPACAO', nome: 'Participou ativamente da Classe Bíblica', pontos: 5 },
]

/**
 * Os dois critérios padrão da Classe Bíblica (regra 11), idempotente: o padrão do gatilho que já
 * existe é reaproveitado; nome tomado por critério não padrão ganha " (Classe Bíblica)" e, se preciso, " 2", " 3"…
 */
export async function garantirCriterios(tx: Prisma.TransactionClient, clubeId: string): Promise<void> {
  // Serializa quem garante ao mesmo tempo (terminar e envio de chamada): o segundo já enxerga o que o primeiro criou.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`criterios-classe-biblica:${clubeId}`}, 0))`
  for (const criterio of CRITERIOS_CB) {
    const existente = await tx.criterioRanking.findFirst({ where: { clubeId, gatilho: criterio.gatilho, padrao: true }, select: { id: true } })
    if (existente) continue
    const maior = await tx.criterioRanking.aggregate({ where: { clubeId }, _max: { ordem: true } })
    await tx.criterioRanking.create({
      data: {
        clubeId,
        nome: await nomeLivre(tx, clubeId, criterio.nome),
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

async function nomeLivre(tx: Prisma.TransactionClient, clubeId: string, nome: string): Promise<string> {
  const tomados = new Set(
    (await tx.criterioRanking.findMany({ where: { clubeId, nome: { startsWith: nome } }, select: { nome: true } })).map((criterio) => criterio.nome),
  )
  if (!tomados.has(nome)) return nome
  const alternativo = `${nome} (Classe Bíblica)`
  let candidato = alternativo
  for (let sufixo = 2; tomados.has(candidato); sufixo++) candidato = `${alternativo} ${sufixo}`
  return candidato
}
