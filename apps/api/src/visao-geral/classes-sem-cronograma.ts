import { nomeDoPar, type VisaoGeralSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { ativaNoClube, avancadasPareadas } from '../classes/par-regular-avancada'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import type { PrismaService } from '../comum/prisma/prisma.service'

type Visao = z.infer<typeof VisaoGeralSaida>

/**
 * Classes que a montagem de cronograma oferece (regular ativa e avançada sem par) e que não têm nenhum cronograma
 * no ano do clube; rascunho e enviado já contam como existentes. O par aparece uma vez, com o nome das duas.
 */
export async function classesSemCronograma(prisma: PrismaService, clubeId: string, anoClube: number): Promise<Visao['classesSemCronograma']> {
  const ativas = await prisma.classe.findMany({
    where: { OR: [{ clubeId: null }, { clubeId }], ativa: true, ...ativaNoClube(clubeId) },
    select: { ...SELECAO_REF_CLASSE, idade: true },
    orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
  })
  const regularIds = ativas.filter((classe) => classe.tipo === 'REGULAR').map((classe) => classe.id)
  const avancadaDaRegular = await avancadasPareadas(prisma, clubeId, regularIds)
  const pareadas = new Set([...avancadaDaRegular.values()].map((avancada) => avancada.id))
  const oferecidas = ativas.filter((classe) => classe.tipo === 'REGULAR' || !pareadas.has(classe.id))

  const comCronograma = await prisma.cronograma.findMany({
    where: { clubeId, anoClube, classeId: { in: oferecidas.map((classe) => classe.id) } },
    select: { classeId: true },
  })
  const jaTem = new Set(comCronograma.map((cronograma) => cronograma.classeId))
  return oferecidas
    .filter((classe) => !jaTem.has(classe.id))
    .map((classe) => ({
      classe: refClasse({ ...classe, nome: nomeDoPar(classe.nome, avancadaDaRegular.get(classe.id)?.nome) }),
      idade: classe.idade,
    }))
}
