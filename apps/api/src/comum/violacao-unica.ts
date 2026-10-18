import { Prisma } from '../generated/prisma/client.js'

/** Corrida de duas gravacoes: o indice unico (ou parcial) do banco recusa a segunda. */
export function ehViolacaoUnica(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002'
}
