import type { PrismaClient, TipoSubstituicao } from '../generated/prisma/client.js'

type Leitor = Pick<PrismaClient, 'unidade' | 'classe' | 'classeClube'>

export interface AlvoDoLink {
  id: string
  nome: string
}

/**
 * Unidade ativa do clube; classe ativa do clube, ou oficial ligada no clube (`ClasseClube.ativa ?? true`).
 * Nulo fora disso: na rota do Adm vira 404, na leitura do link vira CANCELADO.
 */
export async function alvoAtivo(prisma: Leitor, clubeId: string, tipo: TipoSubstituicao, alvoId: string): Promise<AlvoDoLink | null> {
  if (tipo === 'CHAMADA') {
    return prisma.unidade.findFirst({ where: { clubeId, id: alvoId, ativa: true }, select: { id: true, nome: true } })
  }
  const classe = await prisma.classe.findFirst({
    where: { id: alvoId, ativa: true, OR: [{ clubeId: null }, { clubeId }] },
    select: { id: true, nome: true, clubeId: true },
  })
  if (!classe) return null
  if (classe.clubeId === null) {
    const doClube = await prisma.classeClube.findFirst({ where: { clubeId, classeId: classe.id }, select: { ativa: true } })
    if (doClube?.ativa === false) return null
  }
  return { id: classe.id, nome: classe.nome }
}

/** Id do alvo gravado no link, conforme o tipo. */
export function alvoDoLink(link: { tipo: TipoSubstituicao; unidadeId: string | null; classeId: string | null }): string | null {
  return link.tipo === 'CHAMADA' ? link.unidadeId : link.classeId
}
