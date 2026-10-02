import { ItemTarefa } from '@desbravadores/shared'
import type { AulaEnvio } from '@desbravadores/shared'
import { z } from 'zod'
import type { EntradaSalvarAula } from '../../api/aulas'
import type { ItemFila } from '../../offline'

type Corpo = z.infer<typeof AulaEnvio>
export type ItemDaTarefa = z.infer<typeof ItemTarefa>

export interface Requisito {
  id: string
  codigo: string
  texto: string
  campo: boolean
  secaoCodigo: string
}

export interface Membro {
  dbvId: string
  nome: string
  tipo: string
  concluidos: string[]
  /** Quando e em que aula cada requisito foi concluído (`registroAulaId` `null` = fora de aula); ausente em pacote guardado antes de o servidor mandá-las. */
  conclusoes?: { requisitoId: string; concluidoEm: string; registroAulaId: string | null }[]
  /** Especialidades já concluídas que estão em alguma tarefa da classe, e em que registro; ausente em pacote guardado antes da cobrança. */
  especialidades?: { especialidadeId: string; registroAulaId: string | null }[]
  /** Ficha ligada à conta de quem registra: aparece como "você" e outro instrutor ou o Adm marca os requisitos dela. */
  voce?: boolean
}

/** A aula como o servidor a tem (online ou no pacote), com as versões que o aparelho viu. */
export interface BaseAula {
  registroAulaId: string
  aulaPlanejadaId: string | null
  presencas: { dbvId: string; presente: boolean; versao: string }[]
  /** Os requisitos da aula: no pacote, os que têm conclusão nesta aula; `null` só quando a origem não os traz. */
  requisitos: Requisito[] | null
  /** Pares já concluídos NESTA aula (no pacote, as conclusões do membro com este `registroAulaId`). */
  concluidosNaAula: { dbvId: string; requisitoId: string }[]
}

export type Acao = 'MARCAR' | 'DESMARCAR'

export interface EstadoAula {
  /** `null` = a pessoa ainda não disse (edição de um desbravador sem registro nesta aula). */
  presencas: Record<string, boolean | null>
  /** Desbravadores cuja presença foi tocada nesta sessão de edição (só eles vão na correção). */
  tocadas: string[]
  /** Por par `dbvId|requisitoId`: o que a pessoa fez em relação ao que a base e a fila já dizem. */
  acoes: Record<string, Acao>
  /** Por par `dbvId|especialidadeId`: o que a pessoa fez com a entrega da especialidade em relação ao que o servidor e a fila dizem. */
  acoesEspecialidade: Record<string, Acao>
  /** Tarefas que a pessoa mandou encerrar ao salvar. */
  tarefasEncerradas: string[]
  /** Requisitos acrescentados por "+ Requisito" (ou marcados antes e ainda por enviar). */
  extras: string[]
  /** Itens para casa passados nesta sessão de edição: a última ação por item decide em qual lista ele está. */
  itensAcrescentados: ItemDaTarefa[]
  itensRetirados: ItemDaTarefa[]
  /** Id da tarefa deste registro: o que o servidor já tem, o da fila, ou um novo que vale até o primeiro envio. */
  tarefaId: string
}

export const chavePar = (dbvId: string, requisitoId: string): string => `${dbvId}|${requisitoId}`

export const chaveItem = (item: ItemDaTarefa): string => ('requisitoId' in item ? `requisito:${item.requisitoId}` : `especialidade:${item.especialidadeId}`)

export const RascunhoAula = z.object({
  presencas: z.record(z.string(), z.boolean()),
  acoes: z.record(z.string(), z.enum(['MARCAR', 'DESMARCAR'])),
  extras: z.array(z.string()),
  acoesEspecialidade: z.record(z.string(), z.enum(['MARCAR', 'DESMARCAR'])).default({}),
  tarefasEncerradas: z.array(z.string()).default([]),
  itensAcrescentados: z.array(ItemTarefa).default([]),
  itensRetirados: z.array(ItemTarefa).default([]),
})
type Rascunho = z.infer<typeof RascunhoAula>

const PayloadDaFila = z.object({ registroAulaId: z.string(), corpo: z.custom<Corpo>() })
export interface ItemPendente {
  registroAulaId: string
  corpo: Corpo
}

/** Fila da mesma chave: só o que ainda não foi enviado, na ordem em que foi guardado. */
export function itensPendentes(itens: ItemFila[]): ItemPendente[] {
  return itens
    .filter((item) => item.estado === 'NA_FILA' || item.estado === 'ENVIANDO' || item.estado === 'ERRO')
    .sort((a, b) => a.criadoEm - b.criadoEm)
    .flatMap((item) => {
      const lido = PayloadDaFila.safeParse(item.payload)
      return lido.success ? [lido.data] : []
    })
}

export function lerRascunhoValido(valor: unknown): Rascunho | null {
  const lido = RascunhoAula.safeParse(valor)
  return lido.success ? lido.data : null
}

/** Pares concluídos nesta aula segundo o servidor. */
export const concluidosDoServidor = (base: BaseAula | null): Set<string> =>
  new Set((base?.concluidosNaAula ?? []).map((par) => chavePar(par.dbvId, par.requisitoId)))

/** O que o servidor diz, com o que ainda está na fila por cima (a ordem da fila decide). */
export function concluidosComFila(servidor: Set<string>, fila: ItemPendente[]): Set<string> {
  const conjunto = new Set(servidor)
  for (const { corpo } of fila) {
    for (const par of corpo.requisitosMarcados) conjunto.add(chavePar(par.dbvId, par.requisitoId))
    for (const par of corpo.requisitosDesmarcados) conjunto.delete(chavePar(par.dbvId, par.requisitoId))
  }
  return conjunto
}

/** Pares `dbvId|especialidadeId` entregues neste registro: o que o servidor diz, com a fila por cima (a ordem da fila decide). */
export function especialidadesComFila(servidor: ReadonlySet<string>, fila: ItemPendente[]): Set<string> {
  const conjunto = new Set(servidor)
  for (const { corpo } of fila) {
    for (const par of corpo.especialidadesMarcadas ?? []) conjunto.add(chavePar(par.dbvId, par.especialidadeId))
    for (const par of corpo.especialidadesDesmarcadas ?? []) conjunto.delete(chavePar(par.dbvId, par.especialidadeId))
  }
  return conjunto
}

/** Tarefas que a fila já manda encerrar. */
export const encerradasNaFila = (fila: ItemPendente[]): Set<string> => new Set(fila.flatMap(({ corpo }) => corpo.tarefasEncerradas ?? []))

interface Origem {
  membros: Membro[]
  base: BaseAula | null
  fila: ItemPendente[]
  rascunho: Rascunho | null
  /** Id da tarefa que o servidor já tem para este registro (pacote), quando há. */
  tarefaDoRegistroId?: string | null
}

/** Item de tarefa guardado na fila antes de o campo existir não traz as listas. */
const tarefaDoCorpo = (corpo: Partial<Corpo>) => ({
  acrescentados: corpo.tarefaItensAcrescentados ?? [],
  retirados: corpo.tarefaItensRetirados ?? [],
  tarefaId: corpo.tarefaId ?? null,
})

/** Base do servidor, por cima a fila da mesma chave, por cima de tudo o rascunho. Nova: todos presentes. */
export function comporEstado({ membros, base, fila, rascunho, tarefaDoRegistroId = null }: Origem): EstadoAula {
  const padrao = base === null
  const presencas: Record<string, boolean | null> = Object.fromEntries(membros.map((m) => [m.dbvId, padrao ? true : null]))
  for (const linha of base?.presencas ?? []) if (linha.dbvId in presencas) presencas[linha.dbvId] = linha.presente
  const extras = new Set<string>(rascunho?.extras)
  let tarefaDaFila: string | null = null
  for (const { corpo } of fila) {
    tarefaDaFila = tarefaDoCorpo(corpo).tarefaId ?? tarefaDaFila
    for (const linha of corpo.presencas) if (linha.dbvId in presencas) presencas[linha.dbvId] = linha.presente
    for (const par of [...corpo.requisitosMarcados, ...corpo.requisitosDesmarcados]) extras.add(par.requisitoId)
  }
  for (const [dbvId, presente] of Object.entries(rascunho?.presencas ?? {})) if (dbvId in presencas) presencas[dbvId] = presente
  return {
    presencas,
    tocadas: Object.keys(rascunho?.presencas ?? {}).filter((dbvId) => dbvId in presencas),
    acoes: rascunho?.acoes ?? {},
    acoesEspecialidade: rascunho?.acoesEspecialidade ?? {},
    tarefasEncerradas: rascunho?.tarefasEncerradas ?? [],
    extras: [...extras],
    itensAcrescentados: rascunho?.itensAcrescentados ?? [],
    itensRetirados: rascunho?.itensRetirados ?? [],
    tarefaId: tarefaDoRegistroId ?? tarefaDaFila ?? crypto.randomUUID(),
  }
}

export function rascunhoDe(estado: EstadoAula): Rascunho {
  const presencas: Rascunho['presencas'] = {}
  for (const dbvId of estado.tocadas) {
    const presente = estado.presencas[dbvId]
    if (presente !== null && presente !== undefined) presencas[dbvId] = presente
  }
  return {
    presencas,
    acoes: estado.acoes,
    acoesEspecialidade: estado.acoesEspecialidade,
    tarefasEncerradas: estado.tarefasEncerradas,
    extras: estado.extras,
    itensAcrescentados: estado.itensAcrescentados, itensRetirados: estado.itensRetirados,
  }
}

export const estaPresente = (estado: EstadoAula, dbvId: string): boolean => estado.presencas[dbvId] === true

/** O que já está gravado neste registro (servidor e fila), por par `dbvId|id`: faltar desfaz essas entregas. */
export interface Gravadas {
  requisitos: ReadonlySet<string>
  especialidades: ReadonlySet<string>
}

const dosOutros = <T>(acoes: Record<string, T>, dbvId: string): Record<string, T> =>
  Object.fromEntries(Object.entries(acoes).filter(([chave]) => !chave.startsWith(`${dbvId}|`)))

const desfazendo = (chaves: ReadonlySet<string>, dbvId: string): Record<string, Acao> =>
  Object.fromEntries([...chaves].filter((chave) => chave.startsWith(`${dbvId}|`)).map((chave) => [chave, 'DESMARCAR' as const]))

/** Alterna presença. Faltar desfaz o que a pessoa marcou para esse desbravador nesta sessão e as entregas dele já gravadas neste registro; voltar a presente restaura. */
export function alternarPresenca(estado: EstadoAula, dbvId: string, gravadas: Gravadas = { requisitos: new Set(), especialidades: new Set() }): EstadoAula {
  const presente = !estaPresente(estado, dbvId)
  return {
    ...estado,
    presencas: { ...estado.presencas, [dbvId]: presente },
    tocadas: estado.tocadas.includes(dbvId) ? estado.tocadas : [...estado.tocadas, dbvId],
    acoes: presente ? dosOutros(estado.acoes, dbvId) : { ...dosOutros(estado.acoes, dbvId), ...desfazendo(gravadas.requisitos, dbvId) },
    acoesEspecialidade: presente ? dosOutros(estado.acoesEspecialidade, dbvId) : { ...dosOutros(estado.acoesEspecialidade, dbvId), ...desfazendo(gravadas.especialidades, dbvId) },
  }
}

export function efetivamenteConcluido(estado: EstadoAula, base: Set<string>, dbvId: string, requisitoId: string): boolean {
  const chave = chavePar(dbvId, requisitoId)
  const acao = estado.acoes[chave]
  return acao ? acao === 'MARCAR' : base.has(chave)
}

/** Voltar ao que a base já diz apaga a ação: não vira envio redundante. */
export function alternarRequisito(estado: EstadoAula, base: Set<string>, dbvId: string, requisitoId: string): EstadoAula {
  const chave = chavePar(dbvId, requisitoId)
  const proximo = !efetivamenteConcluido(estado, base, dbvId, requisitoId)
  const acoes = { ...estado.acoes }
  if (proximo === base.has(chave)) delete acoes[chave]
  else acoes[chave] = proximo ? 'MARCAR' : 'DESMARCAR'
  return { ...estado, acoes }
}

export function efetivamenteEntregue(estado: EstadoAula, comFila: ReadonlySet<string>, dbvId: string, especialidadeId: string): boolean {
  const chave = chavePar(dbvId, especialidadeId)
  const acao = estado.acoesEspecialidade[chave]
  return acao ? acao === 'MARCAR' : comFila.has(chave)
}

/** Voltar ao que o servidor e a fila já dizem apaga a ação: não vira envio redundante. */
export function alternarEntrega(estado: EstadoAula, comFila: ReadonlySet<string>, dbvId: string, especialidadeId: string): EstadoAula {
  const chave = chavePar(dbvId, especialidadeId)
  const proximo = !efetivamenteEntregue(estado, comFila, dbvId, especialidadeId)
  const acoesEspecialidade = { ...estado.acoesEspecialidade }
  if (proximo === comFila.has(chave)) delete acoesEspecialidade[chave]
  else acoesEspecialidade[chave] = proximo ? 'MARCAR' : 'DESMARCAR'
  return { ...estado, acoesEspecialidade }
}

export const encerrarTarefa = (estado: EstadoAula, tarefaId: string): EstadoAula =>
  estado.tarefasEncerradas.includes(tarefaId) ? estado : { ...estado, tarefasEncerradas: [...estado.tarefasEncerradas, tarefaId] }

export const reabrirTarefa = (estado: EstadoAula, tarefaId: string): EstadoAula => ({ ...estado, tarefasEncerradas: estado.tarefasEncerradas.filter((id) => id !== tarefaId) })

export const acrescentarRequisito = (estado: EstadoAula, requisitoId: string): EstadoAula =>
  estado.extras.includes(requisitoId) ? estado : { ...estado, extras: [...estado.extras, requisitoId] }

const semItem = (itens: ItemDaTarefa[], item: ItemDaTarefa): ItemDaTarefa[] => itens.filter((outro) => chaveItem(outro) !== chaveItem(item))

export const passarItem = (estado: EstadoAula, item: ItemDaTarefa): EstadoAula => ({
  ...estado,
  itensAcrescentados: estado.itensAcrescentados.some((outro) => chaveItem(outro) === chaveItem(item)) ? estado.itensAcrescentados : [...estado.itensAcrescentados, item],
  itensRetirados: semItem(estado.itensRetirados, item),
})

export const tirarItem = (estado: EstadoAula, item: ItemDaTarefa): EstadoAula => ({
  ...estado,
  itensAcrescentados: semItem(estado.itensAcrescentados, item),
  itensRetirados: [...semItem(estado.itensRetirados, item), item],
})

interface ItensDaTarefa {
  /** Itens que o servidor já tem na tarefa deste registro. */
  daTarefa: ItemDaTarefa[]
  fila: ItemPendente[]
  estado: EstadoAula
}

/** Os itens que a tarefa deste registro terá: o do servidor, com a fila e depois a sessão por cima, a última ação vencendo. */
export function itensDaTarefa({ daTarefa, fila, estado }: ItensDaTarefa): ItemDaTarefa[] {
  const itens = new Map(daTarefa.map((item) => [chaveItem(item), item]))
  for (const { corpo } of fila) {
    const { acrescentados, retirados } = tarefaDoCorpo(corpo)
    for (const item of acrescentados) itens.set(chaveItem(item), item)
    for (const item of retirados) itens.delete(chaveItem(item))
  }
  for (const item of estado.itensAcrescentados) itens.set(chaveItem(item), item)
  for (const item of estado.itensRetirados) itens.delete(chaveItem(item))
  return [...itens.values()]
}

/** Passa os requisitos do dia que algum presente não cumpriu, menos os `indisponiveis` (já em tarefa aberta da classe ou já passados). */
export function passarOQueFaltou(estado: EstadoAula, faltas: { requisito: Requisito; nomes: string[] }[], indisponiveis: ReadonlySet<string>): EstadoAula {
  return faltas
    .filter(({ nomes }) => nomes.length > 0)
    .map(({ requisito }): ItemDaTarefa => ({ requisitoId: requisito.id }))
    .filter((item) => !indisponiveis.has(chaveItem(item)))
    .reduce(passarItem, estado)
}

/** Concluído em outra aula: fica feito e travado (nem o servidor nem esta aula o desfazem). */
export const concluidoAntes = (membro: Membro, base: Set<string>, requisitoId: string): boolean =>
  membro.concluidos.includes(requisitoId) && !base.has(chavePar(membro.dbvId, requisitoId))

/** Data (aaaa-mm-dd) em que o membro concluiu o requisito, ou `null` se não consta. */
export const concluidoEm = (membro: Membro, requisitoId: string): string | null =>
  (membro.conclusoes ?? []).find((conclusao) => conclusao.requisitoId === requisitoId)?.concluidoEm ?? null

/** Especialidade que o membro concluiu em outro registro (ou fora de aula): não deve mais nada dela. */
export const especialidadeConcluidaAntes = (membro: Membro, especialidadeId: string, registroAulaId: string): boolean =>
  (membro.especialidades ?? []).some((conclusao) => conclusao.especialidadeId === especialidadeId && conclusao.registroAulaId !== registroAulaId)

interface Entregas {
  itens: ItemDaTarefa[]
  membros: Membro[]
  estado: EstadoAula
  comFila: Set<string>
  especialidadesFila: ReadonlySet<string>
}

/** Chaves (`chaveItem`) dos itens que alguém entrega neste registro, contando o que a pessoa acabou de marcar. */
export function itensEntreguesAqui({ itens, membros, estado, comFila, especialidadesFila }: Entregas): Set<string> {
  const quemEntrega = membros.filter((membro) => !membro.voce)
  const entregue = (item: ItemDaTarefa): boolean =>
    'requisitoId' in item
      ? quemEntrega.some((m) => !concluidoAntes(m, comFila, item.requisitoId) && efetivamenteConcluido(estado, comFila, m.dbvId, item.requisitoId))
      : quemEntrega.some((m) => efetivamenteEntregue(estado, especialidadesFila, m.dbvId, item.especialidadeId))
  return new Set(itens.filter(entregue).map(chaveItem))
}

interface Visiveis {
  daClasse: Requisito[]
  base: BaseAula | null
  planejados: string[]
  estado: EstadoAula
  /** Requisitos que são item de tarefa anterior: aparecem só na cobrança, a menos que estejam planejados para a data. */
  daCobranca?: ReadonlySet<string>
}

/** Requisitos da aula (do servidor e do cronograma publicado da data) mais os acrescentados, na ordem da classe. */
export function requisitosVisiveis({ daClasse, base, planejados, estado, daCobranca = new Set() }: Visiveis): Requisito[] {
  const doRegistro = [...estado.extras, ...(base?.requisitos ?? []).map((r) => r.id)].filter((id) => !daCobranca.has(id))
  const ids = new Set([...planejados, ...doRegistro])
  const conhecidos = new Map(daClasse.map((r) => [r.id, r]))
  for (const requisito of base?.requisitos ?? []) if (!conhecidos.has(requisito.id)) conhecidos.set(requisito.id, requisito)
  const daOrdem = [...daClasse, ...(base?.requisitos ?? []).filter((r) => !daClasse.some((c) => c.id === r.id))]
  return daOrdem.filter((r) => ids.has(r.id)).map((r) => conhecidos.get(r.id) ?? r)
}

interface PontosDeEspecialidade {
  servidor: ReadonlySet<string>
  comFila: ReadonlySet<string>
  pontos: { pontos: number; ativo: boolean }
}

interface Pontos {
  membros: Membro[]
  estado: EstadoAula
  servidor: Set<string>
  comFila: Set<string>
  requisitos: Requisito[]
  pontosRequisito: { pontos: number; ativo: boolean }
  especialidades?: PontosDeEspecialidade
}

const pontuaNaPrevia = (membro: Membro, estado: EstadoAula): boolean => membro.tipo === 'DBV' && !membro.voce && estaPresente(estado, membro.dbvId)

function pontosDeRequisito({ membros, estado, servidor, comFila, requisitos, pontosRequisito }: Pontos): number {
  if (!pontosRequisito.ativo) return 0
  let novos = 0
  for (const membro of membros.filter((m) => pontuaNaPrevia(m, estado))) {
    for (const requisito of requisitos) {
      const chave = chavePar(membro.dbvId, requisito.id)
      const concluido = efetivamenteConcluido(estado, comFila, membro.dbvId, requisito.id)
      if (concluido && !servidor.has(chave) && !concluidoAntes(membro, comFila, requisito.id)) novos += 1
    }
  }
  return novos * pontosRequisito.pontos
}

function pontosDeEspecialidade({ membros, estado, especialidades }: Pontos): number {
  if (!especialidades?.pontos.ativo) return 0
  const candidatas = new Set([...especialidades.comFila, ...Object.keys(estado.acoesEspecialidade)])
  let novas = 0
  for (const chave of candidatas) {
    const [dbvId = '', especialidadeId = ''] = chave.split('|')
    const membro = membros.find((m) => m.dbvId === dbvId)
    if (membro && pontuaNaPrevia(membro, estado) && efetivamenteEntregue(estado, especialidades.comFila, dbvId, especialidadeId) && !especialidades.servidor.has(chave)) novas += 1
  }
  return novas * especialidades.pontos.pontos
}

/** Só o que o servidor ainda não tem, de presente do tipo DBV. LIDER e a ficha do próprio instrutor não pontuam. */
export const pontosProvisorios = (entrada: Pontos): number => pontosDeRequisito(entrada) + pontosDeEspecialidade(entrada)

/** Quem está presente e ainda não cumpriu cada requisito; a ficha do próprio instrutor não entra, porque ele não a marca. */
export function quemFalta(membros: Membro[], estado: EstadoAula, comFila: Set<string>, requisitos: Requisito[]): { requisito: Requisito; nomes: string[] }[] {
  return requisitos.map((requisito) => ({
    requisito,
    nomes: membros
      .filter((m) => !m.voce && estaPresente(estado, m.dbvId))
      .filter((m) => !efetivamenteConcluido(estado, comFila, m.dbvId, requisito.id) && !concluidoAntes(m, comFila, requisito.id))
      .map((m) => m.nome),
  }))
}

interface Contexto {
  estado: EstadoAula
  membros: Membro[]
  requisitos: Requisito[]
  base: BaseAula | null
  registroAulaId: string
  aulaPlanejadaId: string | null
  /** Catálogo do pacote: dá o nome das especialidades da tarefa, para os avisos depois do envio. */
  especialidades: { id: string; nome: string }[]
  classe: { id: string; nome: string }
  data: string
}

/** O que enfileirar; `null` quando não há o que salvar. Nova envia todos; correção, só o que foi tocado. */
export function montarEntrada({ estado, membros, requisitos, especialidades, base, registroAulaId, aulaPlanejadaId, classe, data }: Contexto): EntradaSalvarAula | null {
  const versoes = new Map((base?.presencas ?? []).map((linha) => [linha.dbvId, linha.versao]))
  const paraPresenca = (dbvId: string) => ({ dbvId, presente: estaPresente(estado, dbvId), versaoVista: versoes.get(dbvId) ?? null })
  const presencas = base ? estado.tocadas.map(paraPresenca) : membros.map((m) => paraPresenca(m.dbvId))
  const daPropriaFicha = new Set(membros.filter((m) => m.voce).map((m) => m.dbvId))
  const paresDe = (acoes: Record<string, Acao>) =>
    Object.entries(acoes).flatMap(([chave, acao]) => {
      const [dbvId = '', itemId = ''] = chave.split('|')
      const vale = acao === 'DESMARCAR' || estaPresente(estado, dbvId)
      return vale && !daPropriaFicha.has(dbvId) ? [{ dbvId, itemId, acao }] : []
    })
  const requisitosPares = paresDe(estado.acoes)
  const especialidadesPares = paresDe(estado.acoesEspecialidade)
  const marcados = requisitosPares.filter((p) => p.acao === 'MARCAR').map(({ dbvId, itemId }) => ({ dbvId, requisitoId: itemId }))
  const desmarcados = requisitosPares.filter((p) => p.acao === 'DESMARCAR').map(({ dbvId, itemId }) => ({ dbvId, requisitoId: itemId }))
  const especialidadesMarcadas = especialidadesPares.filter((p) => p.acao === 'MARCAR').map(({ dbvId, itemId }) => ({ dbvId, especialidadeId: itemId }))
  const especialidadesDesmarcadas = especialidadesPares.filter((p) => p.acao === 'DESMARCAR').map(({ dbvId, itemId }) => ({ dbvId, especialidadeId: itemId }))
  const tarefaMudou = estado.itensAcrescentados.length > 0 || estado.itensRetirados.length > 0
  const semNada = [presencas, marcados, desmarcados, especialidadesMarcadas, especialidadesDesmarcadas, estado.tarefasEncerradas].every((lista) => lista.length === 0)
  if (semNada && !tarefaMudou) return null
  const idsDeEspecialidade = new Set([
    ...[...estado.itensAcrescentados, ...estado.itensRetirados].flatMap((item) => ('especialidadeId' in item ? [item.especialidadeId] : [])),
    ...especialidadesPares.map((par) => par.itemId),
  ])
  return {
    classeId: classe.id,
    classeNome: classe.nome,
    data,
    registroAulaId,
    correcao: base !== null,
    aulaPlanejadaId,
    presencas,
    requisitosMarcados: marcados,
    requisitosDesmarcados: desmarcados,
    especialidadesMarcadas,
    especialidadesDesmarcadas,
    tarefasEncerradas: estado.tarefasEncerradas,
    nomes: Object.fromEntries(membros.map((m) => [m.dbvId, m.nome])),
    codigos: Object.fromEntries(requisitos.map((r) => [r.id, r.codigo])),
    especialidades: Object.fromEntries(especialidades.filter((e) => idsDeEspecialidade.has(e.id)).map((e) => [e.id, e.nome])),
    tarefaId: tarefaMudou ? estado.tarefaId : null,
    tarefaItensAcrescentados: estado.itensAcrescentados,
    tarefaItensRetirados: estado.itensRetirados,
  }
}
