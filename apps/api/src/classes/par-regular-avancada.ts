import type { Classe, Prisma, QuemMonta } from '../generated/prisma/client.js'

type Cliente = Pick<Prisma.TransactionClient, 'classe'>

/** Classe desligada pelo clube (`ClasseClube.ativa = false`) não existe para matrícula nova. */
export const ativaNoClube = (clubeId: string) => ({ clubes: { none: { clubeId, ativa: false } } }) satisfies Prisma.ClasseWhereInput

/**
 * Avancada (individual) cujo par esta ativo: ela e a regular dela ativas no sistema (`Classe.ativa`) e no clube
 * (`ClasseClube.ativa`, ou o padrao quando nao ha linha). Fora disso, a classe fica sozinha.
 */
export function avancadaComParAtivo(clubeId: string): Prisma.ClasseWhereInput {
  return {
    tipo: 'AVANCADA',
    trilha: 'INDIVIDUAL',
    ativa: true,
    classeBaseId: { not: null },
    OR: [{ clubeId: null }, { clubeId }],
    ...ativaNoClube(clubeId),
    classeBase: { is: { ativa: true, ...ativaNoClube(clubeId) } },
  }
}

/** A avancada que anda com cada uma das regulares recebidas (so as de par ativo). */
export function avancadaDoPar(clubeId: string, regularIds: string[]): Prisma.ClasseWhereInput {
  return { ...avancadaComParAtivo(clubeId), classeBaseId: { in: regularIds } }
}

/**
 * A avançada que anda com cada regular recebida (só as de par ativo). Havendo mais de uma avançada ativa para a
 * mesma regular, vale sempre a de menor `ordem` (a mesma que a matrícula escolhe).
 */
export async function avancadasPareadas(db: Cliente, clubeId: string, regularIds: string[]): Promise<Map<string, Classe>> {
  const pareadas = new Map<string, Classe>()
  if (regularIds.length === 0) return pareadas
  const avancadas = await db.classe.findMany({ where: avancadaDoPar(clubeId, regularIds), orderBy: [{ ordem: 'asc' }, { id: 'asc' }] })
  for (const avancada of avancadas) {
    if (avancada.classeBaseId && !pareadas.has(avancada.classeBaseId)) pareadas.set(avancada.classeBaseId, avancada)
  }
  return pareadas
}

/** A avançada pareada desta regular, ou `null` quando o par não está ativo. */
export async function avancadaPareadaDe(db: Cliente, clubeId: string, regularId: string): Promise<Classe | null> {
  return (await avancadasPareadas(db, clubeId, [regularId])).get(regularId) ?? null
}

/**
 * A avançada que a matrícula junto com a regular escolhe: a mesma regra de desempate do par (menor `ordem`, depois
 * menor `id`), mas sem a restrição de trilha — as agrupadas matriculam a "Agrupadas — avançada" mesmo sem formar par.
 */
export async function avancadaParaMatricula(db: Cliente, clubeId: string, regularId: string): Promise<Classe | null> {
  return db.classe.findFirst({
    where: { tipo: 'AVANCADA', classeBaseId: regularId, ativa: true, OR: [{ clubeId: null }, { clubeId }], ...ativaNoClube(clubeId) },
    orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
  })
}

/** A regular desta avançada, quando ela é a avançada pareada de um par ativo; `null` fora disso. */
export async function regularDoPar(db: Cliente, clubeId: string, avancadaId: string): Promise<string | null> {
  const avancada = await db.classe.findFirst({ where: { ...avancadaComParAtivo(clubeId), id: avancadaId }, select: { classeBaseId: true } })
  if (!avancada?.classeBaseId) return null
  return (await avancadaPareadaDe(db, clubeId, avancada.classeBaseId))?.id === avancadaId ? avancada.classeBaseId : null
}

/**
 * A classe dona do cronograma (e do "quem monta"): a regular, quando a classe é a avançada de um par ativo;
 * senão, ela mesma.
 */
export async function classeDonaDoCronograma(db: Cliente, clubeId: string, classeId: string): Promise<string> {
  return (await regularDoPar(db, clubeId, classeId)) ?? classeId
}

/** A avançada com o par ativo: ela e a regular ativas no sistema e no clube, e ela é a pareada da regular. */
export async function temParAtivo(db: Cliente, clubeId: string, avancadaId: string): Promise<boolean> {
  return (await regularDoPar(db, clubeId, avancadaId)) !== null
}

/** A outra classe do par de cada classe recebida (regular -> avançada e avançada -> regular), só dos pares ativos. */
async function parceirasDe(db: Cliente, clubeId: string, classeIds: string[]): Promise<Map<string, string>> {
  const parceiras = new Map<string, string>()
  if (classeIds.length === 0) return parceiras
  const candidatas = await db.classe.findMany({
    where: { ...avancadaComParAtivo(clubeId), id: { in: classeIds } },
    select: { id: true, classeBaseId: true },
  })
  const regulares = [...new Set([...classeIds, ...candidatas.flatMap((avancada) => (avancada.classeBaseId ? [avancada.classeBaseId] : []))])]
  for (const [regularId, avancada] of await avancadasPareadas(db, clubeId, regulares)) {
    parceiras.set(regularId, avancada.id)
    parceiras.set(avancada.id, regularId)
  }
  return parceiras
}

/**
 * A regular e a avancada dela andam juntas: devolve a lista com a regular de cada avancada recebida
 * e a avancada de cada regular, quando o par esta ativo. Classe sem par (agrupadas, regular sem avancada
 * ou par desativado no sistema ou no clube) fica como veio.
 */
export async function comParDeClasses(db: Cliente, clubeId: string, classeIds: string[]): Promise<string[]> {
  const recebidas = [...new Set(classeIds)]
  const parceiras = await parceirasDe(db, clubeId, recebidas)
  return [...new Set([...recebidas, ...recebidas.flatMap((id) => parceiras.get(id) ?? [])])]
}

type ClienteDeVinculos = Pick<Prisma.TransactionClient, 'classe' | 'vinculo' | 'vinculoClasse'>

/**
 * O vínculo do instrutor guarda as duas classes do par (o escopo confia no vínculo gravado): quem instrui um lado
 * ganha o outro. Lê o par uma vez e grava tudo num `createMany`. Sem `classeIds`, completa todos os instrutores do
 * clube; com `classeIds`, só os que instruem alguma dessas classes.
 */
export async function completarVinculosDoPar(db: ClienteDeVinculos, clubeId: string, classeIds?: string[]): Promise<void> {
  const vinculos = await db.vinculo.findMany({
    where: { clubeId, papel: 'INSTRUTOR', classes: classeIds ? { some: { classeId: { in: classeIds } } } : { some: {} } },
    select: { id: true, classes: { select: { classeId: true } } },
  })
  const parceiras = await parceirasDe(db, clubeId, [...new Set(vinculos.flatMap((vinculo) => vinculo.classes.map((ligacao) => ligacao.classeId)))])
  const faltam = vinculos.flatMap((vinculo) => {
    const gravadas = new Set(vinculo.classes.map((ligacao) => ligacao.classeId))
    const completas = new Set([...gravadas].flatMap((id) => parceiras.get(id) ?? []))
    return [...completas].filter((id) => !gravadas.has(id)).map((classeId) => ({ vinculoId: vinculo.id, classeId }))
  })
  if (faltam.length > 0) await db.vinculoClasse.createMany({ data: faltam, skipDuplicates: true })
}

type ClienteDeQuemMonta = Pick<Prisma.TransactionClient, 'classe' | 'classeClube'>

/**
 * A avançada do par segue a regular em "quem monta": ao formar o par, a linha da avançada passa a ter o valor da
 * regular (sem linha, vale o padrão ADM). Sem `classeIds`, iguala todos os pares do clube; com `classeIds`, só os
 * pares de que alguma dessas classes faça parte. `ativa` de cada classe não é tocada.
 */
export async function igualarQuemMontaDoPar(db: ClienteDeQuemMonta, clubeId: string, classeIds?: string[]): Promise<void> {
  const candidatas = await db.classe.findMany({
    where: { ...avancadaComParAtivo(clubeId), ...(classeIds ? { AND: [{ OR: [{ id: { in: classeIds } }, { classeBaseId: { in: classeIds } }] }] } : {}) },
    select: { classeBaseId: true },
  })
  const regularIds = [...new Set(candidatas.flatMap((avancada) => (avancada.classeBaseId ? [avancada.classeBaseId] : [])))]
  const pareadas = await avancadasPareadas(db, clubeId, regularIds)
  if (pareadas.size === 0) return
  const dasRegulares = await db.classeClube.findMany({
    where: { clubeId, classeId: { in: [...pareadas.keys()] } },
    select: { classeId: true, quemMontaCronograma: true },
  })
  const valorDaRegular = new Map(dasRegulares.map((linha) => [linha.classeId, linha.quemMontaCronograma]))
  const avancadasPorValor = new Map<QuemMonta, string[]>()
  for (const [regularId, avancada] of pareadas) {
    const quemMontaCronograma = valorDaRegular.get(regularId) ?? 'ADM'
    avancadasPorValor.set(quemMontaCronograma, [...(avancadasPorValor.get(quemMontaCronograma) ?? []), avancada.id])
  }
  // Avançada sem linha ganha uma já com o valor da regular; as que já tinham linha são acertadas por valor.
  await db.classeClube.createMany({
    data: [...avancadasPorValor].flatMap(([quemMontaCronograma, ids]) => ids.map((classeId) => ({ clubeId, classeId, quemMontaCronograma }))),
    skipDuplicates: true,
  })
  for (const [quemMontaCronograma, ids] of avancadasPorValor) {
    await db.classeClube.updateMany({
      where: { clubeId, classeId: { in: ids }, quemMontaCronograma: { not: quemMontaCronograma } },
      data: { quemMontaCronograma },
    })
  }
}
