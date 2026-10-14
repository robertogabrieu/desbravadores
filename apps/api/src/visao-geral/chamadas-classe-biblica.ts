import type { VisaoGeralSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { somarDias } from '../classe-biblica/datas'
import type { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'

type Visao = z.infer<typeof VisaoGeralSaida>

const DIAS_DA_JANELA = 7

/**
 * Pares (encontro, grupo) sem chamada, de encontros de hoje até 7 dias atrás. Mesmos filtros do pacote do conselheiro:
 * encontro não cancelado, edição terminada, grupo não removido. A data do encontro já é a efetiva (remarcado vale pela nova).
 * Consultas separadas, cada uma com `clubeId`: `include` aninhado não passa pela guarda de clube.
 */
export async function chamadasClasseBiblica(prisma: PrismaService, clubeId: string, hoje: string): Promise<Visao['chamadasClasseBiblica']> {
  const encontros = await prisma.encontroClasseBiblica.findMany({
    where: {
      clubeId,
      canceladoEm: null,
      data: { gte: daDataCivil(somarDias(hoje, -DIAS_DA_JANELA)), lte: daDataCivil(hoje) },
      edicao: { clubeId, terminadaEm: { not: null } },
    },
    select: { id: true, edicaoId: true, data: true },
  })
  if (encontros.length === 0) return []

  const [grupos, chamadas] = await Promise.all([
    prisma.grupoClasseBiblica.findMany({
      where: { clubeId, removidoEm: null, edicaoId: { in: [...new Set(encontros.map((encontro) => encontro.edicaoId))] } },
      select: { id: true, nome: true, edicaoId: true },
    }),
    prisma.chamadaClasseBiblica.findMany({
      where: { clubeId, encontroId: { in: encontros.map((encontro) => encontro.id) } },
      select: { encontroId: true, grupoId: true },
    }),
  ])
  const registradas = new Set(chamadas.map((chamada) => `${chamada.encontroId}:${chamada.grupoId}`))

  return encontros
    .flatMap((encontro) =>
      grupos
        .filter((grupo) => grupo.edicaoId === encontro.edicaoId && !registradas.has(`${encontro.id}:${grupo.id}`))
        .map((grupo) => ({ encontroId: encontro.id, data: paraDataCivil(encontro.data), grupoId: grupo.id, grupoNome: grupo.nome })),
    )
    .sort((a, b) => b.data.localeCompare(a.data) || a.grupoNome.localeCompare(b.grupoNome, 'pt-BR') || a.grupoId.localeCompare(b.grupoId))
}
