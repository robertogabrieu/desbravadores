import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { CATEGORIAS_INICIAIS, travarBiblioteca } from '../biblioteca/constantes'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'
import type { Prisma } from '../generated/prisma/client.js'

const ARQUIVOS_DE_CADERNO = ['amigo', 'companheiro', 'pesquisador', 'pioneiro', 'excursionista', 'guia', 'agrupadas']
const LIMITE_DE_DESATIVACAO = 0.1

const CargaRequisito = z.object({
  codigo: z.string(),
  texto: z.string(),
  campo: z.boolean().default(false),
  pagina: z.number().int().nullish(),
  classeBiblica: z.boolean().default(false),
})
const CargaSecao = z.object({
  codigo: z.string(),
  nome: z.string(),
  ordem: z.number().int(),
  requisitos: z.array(CargaRequisito),
})
const CargaClasse = z.object({
  nome: z.string(),
  idade: z.number().int().nullish(),
  tipo: z.enum(['REGULAR', 'AVANCADA']),
  trilha: z.enum(['INDIVIDUAL', 'AGRUPADAS']),
  classeBase: z.string().nullish(),
  secoes: z.array(CargaSecao),
})
const Caderno = z.object({ classes: z.array(CargaClasse) })
const Especialidades = z.object({
  areas: z.array(
    z.object({
      codigo: z.string(),
      nome: z.string(),
      ordem: z.number().int(),
      especialidades: z.array(z.object({ nome: z.string() })),
    }),
  ),
  mestrados: z.array(z.object({ nome: z.string() })),
})

type ClasseCarregada = z.infer<typeof CargaClasse> & { ordem: number }

export interface Contagem {
  criados: number
  atualizados: number
  desativados: number
}

export interface ResumoDaCarga {
  classes: Contagem
  secoes: Contagem
  requisitos: Contagem
  areas: Contagem
  especialidades: Contagem
  mestrados: Contagem
  classesClube: Contagem
  categoriasBiblioteca: { criados: number }
}

export interface OpcoesDaCarga {
  /** Pasta com `cadernos/*.json` e `especialidades.json`. */
  dir: string
  forcar?: boolean
}

/** Nesta fase nenhum requisito tem historico; a Fase 2 consulta `RequisitoConcluido`. */
export function temHistorico(requisitoId: string): Promise<boolean> {
  void requisitoId
  return Promise.resolve(false)
}

function contagemZerada(): Contagem {
  return { criados: 0, atualizados: 0, desativados: 0 }
}

function lerJson<T extends z.ZodType>(caminho: string, schema: T): z.output<T> {
  if (!existsSync(caminho)) throw new Error(`Arquivo da carga ausente: ${caminho}`)
  return schema.parse(JSON.parse(readFileSync(caminho, 'utf8')))
}

/** `ordem` = 100 x indice do arquivo + 2 x posicao da regular; a avancada vem logo depois da sua regular. */
function lerCadernos(dir: string): ClasseCarregada[] {
  return ARQUIVOS_DE_CADERNO.flatMap((arquivo, indice) => {
    const { classes } = lerJson(join(dir, 'cadernos', `${arquivo}.json`), Caderno)
    const regulares = classes.filter((c) => c.tipo === 'REGULAR')
    return classes.map((classe) => {
      const regular =
        classe.tipo === 'REGULAR' ? classe : regulares.find((r) => r.nome === classe.classeBase)
      if (!regular) throw new Error(`Classe base "${classe.classeBase ?? ''}" de "${classe.nome}" nao esta em ${arquivo}.json`)
      const ordemDaRegular = 100 * (indice + 1) + 2 * (regulares.indexOf(regular) + 1)
      return { ...classe, ordem: classe.tipo === 'REGULAR' ? ordemDaRegular : ordemDaRegular + 1 }
    })
  })
}

function chaveClasse(trilha: string, nome: string): string {
  return `${trilha}|${nome}`
}

async function conferirFreio(
  tx: Prisma.TransactionClient,
  classes: ClasseCarregada[],
  especialidades: z.output<typeof Especialidades>,
  forcar: boolean,
): Promise<void> {
  if (forcar) return
  const nosArquivos = new Set(
    classes.flatMap((c) =>
      c.secoes.flatMap((s) => s.requisitos.map((r) => `${chaveClasse(c.trilha, c.nome)}|${s.codigo}|${r.codigo}`)),
    ),
  )
  const requisitos = await tx.requisito.findMany({
    where: { ativo: true, secao: { classe: { clubeId: null } } },
    select: { codigo: true, secao: { select: { codigo: true, classe: { select: { nome: true, trilha: true } } } } },
  })
  const requisitosSumidos = requisitos.filter(
    (r) => !nosArquivos.has(`${chaveClasse(r.secao.classe.trilha, r.secao.classe.nome)}|${r.secao.codigo}|${r.codigo}`),
  ).length

  const nomesNosArquivos = new Set(especialidades.areas.flatMap((a) => a.especialidades.map((e) => `${a.codigo}|${e.nome}`)))
  const ativas = await tx.especialidade.findMany({
    where: { ativa: true, clubeId: null },
    select: { nome: true, area: { select: { codigo: true } } },
  })
  const especialidadesSumidas = ativas.filter((e) => !nomesNosArquivos.has(`${e.area.codigo}|${e.nome}`)).length

  const pesados: [string, number, number][] = [
    ['requisitos', requisitosSumidos, requisitos.length],
    ['especialidades', especialidadesSumidas, ativas.length],
  ]
  for (const [tipo, sumidos, existentes] of pesados) {
    if (existentes > 0 && sumidos / existentes > LIMITE_DE_DESATIVACAO) {
      throw new Error(
        `A carga desativaria ${sumidos} de ${existentes} ${tipo} (mais de 10%). Confira os arquivos ou use --forcar.`,
      )
    }
  }
}

async function sincronizarClasses(
  tx: Prisma.TransactionClient,
  classes: ClasseCarregada[],
  resumo: ResumoDaCarga,
): Promise<Map<string, string>> {
  const idsPorChave = new Map<string, string>()
  // Regulares antes das avancadas: a avancada aponta para o id da regular.
  const ordenadas = [...classes.filter((c) => c.tipo === 'REGULAR'), ...classes.filter((c) => c.tipo === 'AVANCADA')]
  for (const classe of ordenadas) {
    const classeBaseId = classe.classeBase ? (idsPorChave.get(chaveClasse(classe.trilha, classe.classeBase)) ?? null) : null
    const dados = {
      idade: classe.idade ?? null,
      tipo: classe.tipo,
      trilha: classe.trilha,
      origem: 'OFICIAL' as const,
      classeBaseId,
      ordem: classe.ordem,
      ativa: true,
    }
    const existente = await tx.classe.findFirst({ where: { nome: classe.nome, trilha: classe.trilha, clubeId: null } })
    if (!existente) {
      const criada = await tx.classe.create({ data: { ...dados, nome: classe.nome, clubeId: null } })
      idsPorChave.set(chaveClasse(classe.trilha, classe.nome), criada.id)
      resumo.classes.criados++
      continue
    }
    idsPorChave.set(chaveClasse(classe.trilha, classe.nome), existente.id)
    const mudou = (Object.keys(dados) as (keyof typeof dados)[]).some((campo) => existente[campo] !== dados[campo])
    if (mudou) {
      await tx.classe.update({ where: { id: existente.id }, data: dados })
      resumo.classes.atualizados++
    }
  }
  await desativarClassesSumidas(tx, classes, resumo)
  return idsPorChave
}

/** Classe oficial que saiu dos arquivos tem historico: fica inativa, nunca e apagada. */
async function desativarClassesSumidas(
  tx: Prisma.TransactionClient,
  classes: ClasseCarregada[],
  resumo: ResumoDaCarga,
): Promise<void> {
  const nosArquivos = new Set(classes.map((c) => chaveClasse(c.trilha, c.nome)))
  const ativas = await tx.classe.findMany({ where: { clubeId: null, ativa: true }, select: { id: true, nome: true, trilha: true } })
  const sumidas = ativas.filter((c) => !nosArquivos.has(chaveClasse(c.trilha, c.nome))).map((c) => c.id)
  if (sumidas.length === 0) return
  await tx.classe.updateMany({ where: { id: { in: sumidas } }, data: { ativa: false } })
  resumo.classes.desativados += sumidas.length
}

async function sincronizarSecoesERequisitos(
  tx: Prisma.TransactionClient,
  classes: ClasseCarregada[],
  idsDasClasses: Map<string, string>,
  forcar: boolean,
  resumo: ResumoDaCarga,
): Promise<void> {
  for (const classe of classes) {
    const classeId = idsDasClasses.get(chaveClasse(classe.trilha, classe.nome))
    if (!classeId) continue
    for (const secao of classe.secoes) {
      const existente = await tx.secaoRequisito.findUnique({
        where: { classeId_codigo: { classeId, codigo: secao.codigo } },
      })
      let secaoId = existente?.id
      if (!existente) {
        const criada = await tx.secaoRequisito.create({
          data: { classeId, codigo: secao.codigo, nome: secao.nome, ordem: secao.ordem },
        })
        secaoId = criada.id
        resumo.secoes.criados++
      } else if (existente.nome !== secao.nome || existente.ordem !== secao.ordem) {
        await tx.secaoRequisito.update({ where: { id: existente.id }, data: { nome: secao.nome, ordem: secao.ordem } })
        resumo.secoes.atualizados++
      }
      if (secaoId) await sincronizarRequisitos(tx, secaoId, secao.requisitos, forcar, resumo)
    }
  }
  await desativarRequisitosSumidos(tx, classes, resumo)
}

async function sincronizarRequisitos(
  tx: Prisma.TransactionClient,
  secaoId: string,
  requisitos: z.output<typeof CargaRequisito>[],
  forcar: boolean,
  resumo: ResumoDaCarga,
): Promise<void> {
  const existentes = new Map((await tx.requisito.findMany({ where: { secaoId } })).map((r) => [r.codigo, r]))
  const novos: Prisma.RequisitoCreateManyInput[] = []
  for (const [indice, requisito] of requisitos.entries()) {
    const dados = {
      texto: requisito.texto,
      campo: requisito.campo,
      ordem: indice + 1,
      pagina: requisito.pagina ?? null,
      classeBiblica: requisito.classeBiblica,
      ativo: true,
    }
    const existente = existentes.get(requisito.codigo)
    if (!existente) {
      novos.push({ ...dados, secaoId, codigo: requisito.codigo })
      continue
    }
    const mudou = (Object.keys(dados) as (keyof typeof dados)[]).some((campo) => existente[campo] !== dados[campo])
    if (!mudou) continue
    if (existente.texto !== dados.texto && !forcar && (await temHistorico(existente.id))) {
      throw new Error(`O texto do requisito ${requisito.codigo} mudou e ele ja tem historico. Use --forcar.`)
    }
    await tx.requisito.update({ where: { id: existente.id }, data: dados })
    resumo.requisitos.atualizados++
  }
  if (novos.length > 0) {
    await tx.requisito.createMany({ data: novos })
    resumo.requisitos.criados += novos.length
  }
}

async function desativarRequisitosSumidos(
  tx: Prisma.TransactionClient,
  classes: ClasseCarregada[],
  resumo: ResumoDaCarga,
): Promise<void> {
  const nosArquivos = new Set(
    classes.flatMap((c) =>
      c.secoes.flatMap((s) => s.requisitos.map((r) => `${chaveClasse(c.trilha, c.nome)}|${s.codigo}|${r.codigo}`)),
    ),
  )
  const ativos = await tx.requisito.findMany({
    where: { ativo: true, secao: { classe: { clubeId: null } } },
    select: { id: true, codigo: true, secao: { select: { codigo: true, classe: { select: { nome: true, trilha: true } } } } },
  })
  const sumidos = ativos
    .filter((r) => !nosArquivos.has(`${chaveClasse(r.secao.classe.trilha, r.secao.classe.nome)}|${r.secao.codigo}|${r.codigo}`))
    .map((r) => r.id)
  if (sumidos.length === 0) return
  await tx.requisito.updateMany({ where: { id: { in: sumidos } }, data: { ativo: false } })
  resumo.requisitos.desativados += sumidos.length
}

async function sincronizarEspecialidades(
  tx: Prisma.TransactionClient,
  arquivo: z.output<typeof Especialidades>,
  resumo: ResumoDaCarga,
): Promise<void> {
  for (const area of arquivo.areas) {
    const existente = await tx.areaEspecialidade.findUnique({ where: { codigo: area.codigo } })
    let areaId = existente?.id
    if (!existente) {
      areaId = (await tx.areaEspecialidade.create({ data: { codigo: area.codigo, nome: area.nome, ordem: area.ordem } })).id
      resumo.areas.criados++
    } else if (existente.nome !== area.nome || existente.ordem !== area.ordem) {
      await tx.areaEspecialidade.update({ where: { id: existente.id }, data: { nome: area.nome, ordem: area.ordem } })
      resumo.areas.atualizados++
    }
    if (!areaId) continue

    const daArea = new Map(
      (await tx.especialidade.findMany({ where: { areaId, clubeId: null } })).map((e) => [e.nome, e]),
    )
    const novas: Prisma.EspecialidadeCreateManyInput[] = []
    for (const { nome } of area.especialidades) {
      const atual = daArea.get(nome)
      if (!atual) novas.push({ areaId, nome, origem: 'OFICIAL', clubeId: null })
      else if (!atual.ativa) {
        await tx.especialidade.update({ where: { id: atual.id }, data: { ativa: true } })
        resumo.especialidades.atualizados++
      }
    }
    if (novas.length > 0) {
      await tx.especialidade.createMany({ data: novas })
      resumo.especialidades.criados += novas.length
    }
  }

  const nosArquivos = new Set(arquivo.areas.flatMap((a) => a.especialidades.map((e) => `${a.codigo}|${e.nome}`)))
  const ativas = await tx.especialidade.findMany({
    where: { ativa: true, clubeId: null },
    select: { id: true, nome: true, area: { select: { codigo: true } } },
  })
  const sumidas = ativas.filter((e) => !nosArquivos.has(`${e.area.codigo}|${e.nome}`)).map((e) => e.id)
  if (sumidas.length > 0) {
    await tx.especialidade.updateMany({ where: { id: { in: sumidas } }, data: { ativa: false } })
    resumo.especialidades.desativados += sumidas.length
  }
}

async function sincronizarMestrados(
  tx: Prisma.TransactionClient,
  arquivo: z.output<typeof Especialidades>,
  resumo: ResumoDaCarga,
): Promise<void> {
  const nomes = arquivo.mestrados.map((m) => m.nome)
  for (const nome of nomes) {
    const existente = await tx.mestrado.findUnique({ where: { nome } })
    if (!existente) {
      await tx.mestrado.create({ data: { nome } })
      resumo.mestrados.criados++
    } else if (!existente.ativo) {
      await tx.mestrado.update({ where: { id: existente.id }, data: { ativo: true } })
      resumo.mestrados.atualizados++
    }
  }
  const { count } = await tx.mestrado.updateMany({ where: { ativo: true, nome: { notIn: nomes } }, data: { ativo: false } })
  resumo.mestrados.desativados += count
}

async function completarClassesDosClubes(tx: Prisma.TransactionClient, resumo: ResumoDaCarga): Promise<void> {
  const oficiais = await tx.classe.findMany({ where: { clubeId: null, ativa: true }, select: { id: true } })
  for (const clube of await tx.clube.findMany({ select: { id: true } })) {
    const tem = new Set((await tx.classeClube.findMany({ where: { clubeId: clube.id } })).map((c) => c.classeId))
    const faltam = oficiais.filter((c) => !tem.has(c.id))
    if (faltam.length === 0) continue
    await tx.classeClube.createMany({ data: faltam.map((c) => ({ clubeId: clube.id, classeId: c.id })) })
    resumo.classesClube.criados += faltam.length
  }
}

/** Clube sem nenhuma categoria da biblioteca (nem removida) recebe as três iniciais; quem já mexeu nas dele não é tocado. */
async function completarBibliotecaDosClubes(tx: Prisma.TransactionClient, resumo: ResumoDaCarga): Promise<void> {
  for (const clube of await tx.clube.findMany({ select: { id: true } })) {
    await travarBiblioteca(tx, clube.id)
    if ((await tx.categoriaBiblioteca.count({ where: { clubeId: clube.id } })) > 0) continue
    await tx.categoriaBiblioteca.createMany({
      data: CATEGORIAS_INICIAIS.map((nome, indice) => ({ clubeId: clube.id, nome, ordem: indice + 1 })),
    })
    resumo.categoriasBiblioteca.criados += CATEGORIAS_INICIAIS.length
  }
}

/** Carga oficial idempotente (SPEC 5.3), numa transacao: arquivo ausente ou freio acionado nao gravam nada. */
export async function executarCarga(prisma: PrismaSistema, opcoes: OpcoesDaCarga): Promise<ResumoDaCarga> {
  const classes = lerCadernos(opcoes.dir)
  const especialidades = lerJson(join(opcoes.dir, 'especialidades.json'), Especialidades)
  const forcar = opcoes.forcar ?? false
  const resumo: ResumoDaCarga = {
    classes: contagemZerada(),
    secoes: contagemZerada(),
    requisitos: contagemZerada(),
    areas: contagemZerada(),
    especialidades: contagemZerada(),
    mestrados: contagemZerada(),
    classesClube: contagemZerada(),
    categoriasBiblioteca: { criados: 0 },
  }

  await prisma.$transaction(
    async (tx) => {
      await conferirFreio(tx, classes, especialidades, forcar)
      const idsDasClasses = await sincronizarClasses(tx, classes, resumo)
      await sincronizarSecoesERequisitos(tx, classes, idsDasClasses, forcar, resumo)
      await sincronizarEspecialidades(tx, especialidades, resumo)
      await sincronizarMestrados(tx, especialidades, resumo)
      await completarClassesDosClubes(tx, resumo)
      await completarBibliotecaDosClubes(tx, resumo)
    },
    { timeout: 300_000, maxWait: 30_000 },
  )
  return resumo
}

function imprimirResumo(resumo: ResumoDaCarga): void {
  console.table(resumo)
}

async function principal(): Promise<void> {
  const forcar = process.argv.includes('--forcar')
  const dir = process.env['CARGA_DIR'] || resolve(__dirname, '../../../../docs/planejamento/dados')
  const prisma = new PrismaSistema()
  try {
    imprimirResumo(await executarCarga(prisma, { dir, forcar }))
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  principal().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
}
