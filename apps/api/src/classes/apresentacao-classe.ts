import type { RefClasse } from '@desbravadores/shared'
import type { Prisma } from '../generated/prisma/client.js'
import type { z } from 'zod'
import { semAcento } from '../desbravadores/apoio'

export const SELECAO_REF_CLASSE = {
  id: true,
  nome: true,
  tipo: true,
  trilha: true,
  origem: true,
  classeBase: { select: { nome: true } },
} satisfies Prisma.ClasseSelect

export type ClasseParaRef = Prisma.ClasseGetPayload<{ select: typeof SELECAO_REF_CLASSE }>

const COR_PADRAO = '--color-primary'

/**
 * Token CSS da classe (SPEC D19): regular individual usa `--classe-<nome>`; a avancada herda da
 * regular; agrupadas e classes do clube usam a cor primaria.
 */
export function corTokenDaClasse(classe: ClasseParaRef): string {
  if (classe.origem === 'CLUBE' || classe.trilha === 'AGRUPADAS') return COR_PADRAO
  const nomeBase = classe.tipo === 'AVANCADA' ? classe.classeBase?.nome : classe.nome
  if (!nomeBase) return COR_PADRAO
  return `--classe-${semAcento(nomeBase).replace(/[^a-z0-9]+/g, '-')}`
}

export function refClasse(classe: ClasseParaRef): z.infer<typeof RefClasse> {
  return { id: classe.id, nome: classe.nome, tipo: classe.tipo, trilha: classe.trilha, corToken: corTokenDaClasse(classe) }
}
