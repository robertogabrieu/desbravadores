import type { ItemTarefa } from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import type { Prisma } from '../generated/prisma/client.js'
import { ehFichaDaSessao } from '../progresso/conclusoes'
import { requisitosValidos } from './tarefas-envio'

type Db = Prisma.TransactionClient
type Item = z.infer<typeof ItemTarefa>

export interface TarefaLida {
  id: string
  registroAulaId: string
  data: string
  encerrada: boolean
  itens: Item[]
}

/** Chave estavel de um item, para contar item distinto entre tarefas. */
export function chaveDoItem(item: Item): string {
  return 'requisitoId' in item ? `requisito:${item.requisitoId}` : `especialidade:${item.especialidadeId}`
}

function ordemDosItens(a: Item, b: Item): number {
  return chaveDoItem(a).localeCompare(chaveDoItem(b))
}

/** Itens ativos da tarefa que ainda valem: requisito ativo da classe (com o ajuste do clube) ou especialidade ativa. */
async function itensValidos(db: Db, clubeId: string, classeId: string, itens: { requisitoId: string | null; especialidadeId: string | null }[]): Promise<Set<string>> {
  const requisitoIds = itens.flatMap((item) => (item.requisitoId ? [item.requisitoId] : []))
  const especialidadeIds = itens.flatMap((item) => (item.especialidadeId ? [item.especialidadeId] : []))
  const [requisitos, especialidades] = await Promise.all([
    requisitosValidos(db, clubeId, classeId, requisitoIds),
    especialidadeIds.length === 0
      ? []
      : db.especialidade.findMany({ where: { id: { in: especialidadeIds }, ativa: true, OR: [{ clubeId: null }, { clubeId }] }, select: { id: true } }),
  ])
  return new Set([
    ...[...requisitos].map((id) => `requisito:${id}`),
    ...especialidades.map((especialidade) => `especialidade:${especialidade.id}`),
  ])
}

async function lerTarefas(db: Db, clubeId: string, classeId: string, onde: Prisma.TarefaCasaWhereInput): Promise<TarefaLida[]> {
  const tarefas = await db.tarefaCasa.findMany({
    where: { clubeId, classeId, ...onde },
    select: {
      id: true,
      registroAulaId: true,
      encerradaEm: true,
      registro: { select: { data: true } },
      itens: { where: { clubeId, removidoEm: null }, select: { requisitoId: true, especialidadeId: true } },
    },
    orderBy: [{ registro: { data: 'asc' } }, { id: 'asc' }],
  })
  const validos = await itensValidos(db, clubeId, classeId, tarefas.flatMap((tarefa) => tarefa.itens))
  return tarefas.map((tarefa) => ({
    id: tarefa.id,
    registroAulaId: tarefa.registroAulaId,
    data: paraDataCivil(tarefa.registro.data),
    encerrada: tarefa.encerradaEm !== null,
    itens: tarefa.itens
      .map((item): Item => (item.requisitoId ? { requisitoId: item.requisitoId } : { especialidadeId: item.especialidadeId ?? '' }))
      .filter((item) => validos.has(chaveDoItem(item)))
      .sort(ordemDosItens),
  }))
}

function abertasDoAno(db: Db, clubeId: string, classeId: string, anoClube: number): Promise<TarefaLida[]> {
  return lerTarefas(db, clubeId, classeId, { encerradaEm: null, anoClube })
}

/**
 * Por item ativo de tarefa aberta do ano, quem deve: cursa a classe no ano, nao tem conclusao ativa do item e nao e a
 * ficha ligada a conta de quem le. So entram itens com alguem devendo.
 */
export async function devedoresPorItem(
  db: Db,
  clubeId: string,
  classeId: string,
  anoClube: number,
  sessao: Pick<SessaoLogada, 'papel' | 'usuarioId'>,
): Promise<Map<string, Set<string>>> {
  const itens = new Map((await abertasDoAno(db, clubeId, classeId, anoClube)).flatMap((tarefa) => tarefa.itens).map((item) => [chaveDoItem(item), item]))
  if (itens.size === 0) return new Map()

  const matriculas = await db.matriculaClasse.findMany({
    where: { clubeId, classeId, anoClube, status: 'CURSANDO', dbv: { clubeId, ativo: true, tipo: { in: ['DBV', 'DIRETORIA', 'LIDER'] } } },
    select: { dbvId: true, dbv: { select: { usuarioId: true } } },
  })
  const dbvIds = matriculas.filter(({ dbv }) => !ehFichaDaSessao(sessao, dbv.usuarioId)).map(({ dbvId }) => dbvId)
  const requisitoIds = [...itens.values()].flatMap((item) => ('requisitoId' in item ? [item.requisitoId] : []))
  const especialidadeIds = [...itens.values()].flatMap((item) => ('especialidadeId' in item ? [item.especialidadeId] : []))
  const [requisitosFeitos, especialidadesFeitas] = await Promise.all([
    db.requisitoConcluido.findMany({ where: { clubeId, removidoEm: null, dbvId: { in: dbvIds }, requisitoId: { in: requisitoIds } }, select: { dbvId: true, requisitoId: true } }),
    db.especialidadeConcluida.findMany({ where: { clubeId, removidoEm: null, dbvId: { in: dbvIds }, especialidadeId: { in: especialidadeIds } }, select: { dbvId: true, especialidadeId: true } }),
  ])
  const feitos = new Set([
    ...requisitosFeitos.map((c) => `${c.dbvId}:requisito:${c.requisitoId}`),
    ...especialidadesFeitas.map((c) => `${c.dbvId}:especialidade:${c.especialidadeId}`),
  ])

  const devedores = new Map<string, Set<string>>()
  for (const chave of itens.keys()) {
    const devem = dbvIds.filter((dbvId) => !feitos.has(`${dbvId}:${chave}`))
    if (devem.length > 0) devedores.set(chave, new Set(devem))
  }
  return devedores
}

/**
 * As tarefas da classe para o pacote: abertas do ano com alguem devendo e encerradas com entrega num registro
 * da classe a partir de `desde` (para corrigir sem rede). Itens que deixaram de valer ficam de fora.
 */
export async function tarefasDaClasse(
  db: Db,
  clubeId: string,
  classeId: string,
  anoClube: number,
  desde: string,
  devedores: ReadonlyMap<string, ReadonlySet<string>>,
): Promise<TarefaLida[]> {
  const [abertas, encerradas] = await Promise.all([
    abertasDoAno(db, clubeId, classeId, anoClube),
    lerTarefas(db, clubeId, classeId, { encerradaEm: { not: null } }),
  ])
  const entregues = await itensEntreguesDesde(db, clubeId, classeId, desde)
  return [
    ...abertas.filter((tarefa) => tarefa.itens.some((item) => devedores.has(chaveDoItem(item)))),
    ...encerradas.filter((tarefa) => tarefa.itens.some((item) => entregues.has(chaveDoItem(item)))),
  ].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))
}

/** Chaves dos itens concluidos (ativos) em registros da classe a partir de `desde`. */
async function itensEntreguesDesde(db: Db, clubeId: string, classeId: string, desde: string): Promise<Set<string>> {
  const registro = { clubeId, classeId, data: { gte: daDataCivil(desde) } }
  const [requisitos, especialidades] = await Promise.all([
    db.requisitoConcluido.findMany({ where: { clubeId, removidoEm: null, registro }, select: { requisitoId: true } }),
    db.especialidadeConcluida.findMany({ where: { clubeId, removidoEm: null, registro }, select: { especialidadeId: true } }),
  ])
  return new Set([
    ...requisitos.map((c) => `requisito:${c.requisitoId}`),
    ...especialidades.map((c) => `especialidade:${c.especialidadeId}`),
  ])
}
