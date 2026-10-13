import { REGRAS_DE_PONTUACAO, type DefinicaoDeRegra } from '@desbravadores/shared'
import type { Prisma } from '../../generated/prisma/client.js'

/** As 7 regras que não são da Classe Bíblica; as 2 da Classe Bíblica têm a função própria em `classe-biblica/criterios.ts`. */
export const REGRAS_BASICAS: readonly DefinicaoDeRegra[] = REGRAS_DE_PONTUACAO.filter((regra) => regra.grupo !== 'classe-biblica')

/** Colunas do critério padrão de uma regra básica, a partir da tabela compartilhada (usada também na semente do clube). */
export function criterioDaRegraBasica(regra: DefinicaoDeRegra) {
  return {
    nome: regra.rotulo,
    pontos: regra.pontosIniciais,
    ativo: regra.ligadaNoInicio,
    ordem: regra.ordem,
    gatilho: regra.gatilho,
    lancadoPor: regra.lancadoPor,
    padrao: true,
  } as const
}

/**
 * As 7 regras básicas do ranking, idempotente: clube antigo não as tem (as migrations nunca as criaram). O padrão do
 * gatilho que já existe é reaproveitado; nome tomado por critério não padrão ganha " 2", " 3"…
 */
export async function garantirCriteriosBasicos(tx: Prisma.TransactionClient, clubeId: string): Promise<void> {
  // Serializa quem garante ao mesmo tempo (GET e PATCH): o segundo já enxerga o que o primeiro criou.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`criterios-basicos:${clubeId}`}, 0))`
  for (const regra of REGRAS_BASICAS) {
    const existente = await tx.criterioRanking.findFirst({ where: { clubeId, gatilho: regra.gatilho, padrao: true }, select: { id: true } })
    if (existente) continue
    const criterio = criterioDaRegraBasica(regra)
    await tx.criterioRanking.create({ data: { ...criterio, clubeId, nome: await nomeLivre(tx, clubeId, criterio.nome) } })
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
