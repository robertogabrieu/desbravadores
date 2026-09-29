import type { VinculoResumo } from '@desbravadores/shared'
import type { z } from 'zod'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'

export type VinculoResumoSaida = z.infer<typeof VinculoResumo>

interface ClasseDoVinculo {
  nome: string
  origem: 'OFICIAL' | 'CLUBE'
  tipo: 'REGULAR' | 'AVANCADA'
  trilha: 'INDIVIDUAL' | 'AGRUPADAS'
  classeBase: { nome: string } | null
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/** D19: regular individual oficial tem token proprio; avancada herda da regular; o resto usa a cor do clube. */
function corTokenDaClasse(classe: ClasseDoVinculo): string {
  if (classe.origem !== 'OFICIAL' || classe.trilha !== 'INDIVIDUAL') return '--color-primary'
  const nomeBase = classe.tipo === 'AVANCADA' ? (classe.classeBase?.nome ?? classe.nome) : classe.nome
  return `--classe-${semAcento(nomeBase)}`
}

/** Vinculos ativos do usuario, com clube, unidades (CONSELHEIRO) e classes (INSTRUTOR). */
export async function montarVinculos(prisma: PrismaSistema, usuarioId: string): Promise<VinculoResumoSaida[]> {
  const vinculos = await prisma.vinculo.findMany({
    where: { usuarioId, ativo: true },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      papel: true,
      clube: { select: { id: true, nome: true, slug: true } },
      unidades: { select: { unidade: { select: { id: true, nome: true } } } },
      classes: {
        select: {
          classe: {
            select: {
              id: true,
              nome: true,
              origem: true,
              tipo: true,
              trilha: true,
              classeBase: { select: { nome: true } },
            },
          },
        },
      },
    },
  })
  return vinculos.map((v) => ({
    id: v.id,
    papel: v.papel,
    clube: v.clube,
    unidades: v.papel === 'CONSELHEIRO' ? v.unidades.map((u) => u.unidade) : [],
    classes:
      v.papel === 'INSTRUTOR'
        ? v.classes.map(({ classe }) => ({
            id: classe.id,
            nome: classe.nome,
            tipo: classe.tipo,
            trilha: classe.trilha,
            corToken: corTokenDaClasse(classe),
          }))
        : [],
  }))
}
