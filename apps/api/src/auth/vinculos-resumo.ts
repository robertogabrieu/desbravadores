import type { VinculoResumo } from '@desbravadores/shared'
import type { z } from 'zod'
import { corTokenDaClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'

export type VinculoResumoSaida = z.infer<typeof VinculoResumo>

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
          classe: { select: SELECAO_REF_CLASSE },
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
