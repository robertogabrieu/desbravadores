import type { AulaEnvio } from '@desbravadores/shared'
import { z } from 'zod'
import type { EntradaSalvarAula } from '../../api/aulas'
import type { ItemFila } from '../../offline'

type Corpo = z.infer<typeof AulaEnvio>

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
  /** Requisitos acrescentados por "+ Requisito" (ou marcados antes e ainda por enviar). */
  extras: string[]
}

export const chavePar = (dbvId: string, requisitoId: string): string => `${dbvId}|${requisitoId}`

export const RascunhoAula = z.object({
  presencas: z.record(z.string(), z.boolean()),
  acoes: z.record(z.string(), z.enum(['MARCAR', 'DESMARCAR'])),
  extras: z.array(z.string()),
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

interface Origem {
  membros: Membro[]
  base: BaseAula | null
  fila: ItemPendente[]
  rascunho: Rascunho | null
}

/** Base do servidor, por cima a fila da mesma chave, por cima de tudo o rascunho. Nova: todos presentes. */
export function comporEstado({ membros, base, fila, rascunho }: Origem): EstadoAula {
  const padrao = base === null
  const presencas: Record<string, boolean | null> = Object.fromEntries(membros.map((m) => [m.dbvId, padrao ? true : null]))
  for (const linha of base?.presencas ?? []) if (linha.dbvId in presencas) presencas[linha.dbvId] = linha.presente
  const extras = new Set<string>(rascunho?.extras)
  for (const { corpo } of fila) {
    for (const linha of corpo.presencas) if (linha.dbvId in presencas) presencas[linha.dbvId] = linha.presente
    for (const par of [...corpo.requisitosMarcados, ...corpo.requisitosDesmarcados]) extras.add(par.requisitoId)
  }
  for (const [dbvId, presente] of Object.entries(rascunho?.presencas ?? {})) if (dbvId in presencas) presencas[dbvId] = presente
  return {
    presencas,
    tocadas: Object.keys(rascunho?.presencas ?? {}).filter((dbvId) => dbvId in presencas),
    acoes: rascunho?.acoes ?? {},
    extras: [...extras],
  }
}

export function rascunhoDe(estado: EstadoAula): Rascunho {
  const presencas: Rascunho['presencas'] = {}
  for (const dbvId of estado.tocadas) {
    const presente = estado.presencas[dbvId]
    if (presente !== null && presente !== undefined) presencas[dbvId] = presente
  }
  return { presencas, acoes: estado.acoes, extras: estado.extras }
}

export const estaPresente = (estado: EstadoAula, dbvId: string): boolean => estado.presencas[dbvId] === true

/** Alterna presença. Faltar desfaz o que a pessoa marcou para esse desbravador nesta sessão. */
export function alternarPresenca(estado: EstadoAula, dbvId: string): EstadoAula {
  const presente = !estaPresente(estado, dbvId)
  const acoes = presente ? estado.acoes : Object.fromEntries(Object.entries(estado.acoes).filter(([chave]) => !chave.startsWith(`${dbvId}|`)))
  return {
    ...estado,
    presencas: { ...estado.presencas, [dbvId]: presente },
    tocadas: estado.tocadas.includes(dbvId) ? estado.tocadas : [...estado.tocadas, dbvId],
    acoes,
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

export const acrescentarRequisito = (estado: EstadoAula, requisitoId: string): EstadoAula =>
  estado.extras.includes(requisitoId) ? estado : { ...estado, extras: [...estado.extras, requisitoId] }

/** Concluído em outra aula: fica feito e travado (nem o servidor nem esta aula o desfazem). */
export const concluidoAntes = (membro: Membro, base: Set<string>, requisitoId: string): boolean =>
  membro.concluidos.includes(requisitoId) && !base.has(chavePar(membro.dbvId, requisitoId))

/** Data (aaaa-mm-dd) em que o membro concluiu o requisito, ou `null` se não consta. */
export const concluidoEm = (membro: Membro, requisitoId: string): string | null =>
  (membro.conclusoes ?? []).find((conclusao) => conclusao.requisitoId === requisitoId)?.concluidoEm ?? null

interface Visiveis {
  daClasse: Requisito[]
  base: BaseAula | null
  planejados: string[]
  estado: EstadoAula
}

/** Requisitos da aula (do servidor e do cronograma publicado da data) mais os acrescentados, na ordem da classe. */
export function requisitosVisiveis({ daClasse, base, planejados, estado }: Visiveis): Requisito[] {
  const ids = new Set([...planejados, ...estado.extras, ...(base?.requisitos ?? []).map((r) => r.id)])
  const conhecidos = new Map(daClasse.map((r) => [r.id, r]))
  for (const requisito of base?.requisitos ?? []) if (!conhecidos.has(requisito.id)) conhecidos.set(requisito.id, requisito)
  const daOrdem = [...daClasse, ...(base?.requisitos ?? []).filter((r) => !daClasse.some((c) => c.id === r.id))]
  return daOrdem.filter((r) => ids.has(r.id)).map((r) => conhecidos.get(r.id) ?? r)
}

interface Pontos {
  membros: Membro[]
  estado: EstadoAula
  servidor: Set<string>
  comFila: Set<string>
  requisitos: Requisito[]
  pontosRequisito: { pontos: number; ativo: boolean }
}

/** Só requisito novo (que o servidor ainda não tem), de presente do tipo DBV. LIDER e a ficha do próprio instrutor não pontuam. */
export function pontosProvisorios({ membros, estado, servidor, comFila, requisitos, pontosRequisito }: Pontos): number {
  if (!pontosRequisito.ativo) return 0
  let novos = 0
  for (const membro of membros) {
    if (membro.tipo !== 'DBV' || membro.voce || !estaPresente(estado, membro.dbvId)) continue
    for (const requisito of requisitos) {
      const chave = chavePar(membro.dbvId, requisito.id)
      const concluido = efetivamenteConcluido(estado, comFila, membro.dbvId, requisito.id)
      if (concluido && !servidor.has(chave) && !concluidoAntes(membro, comFila, requisito.id)) novos += 1
    }
  }
  return novos * pontosRequisito.pontos
}

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
  classe: { id: string; nome: string }
  data: string
}

/** O que enfileirar; `null` quando não há o que salvar. Nova envia todos; correção, só o que foi tocado. */
export function montarEntrada({ estado, membros, requisitos, base, registroAulaId, aulaPlanejadaId, classe, data }: Contexto): EntradaSalvarAula | null {
  const versoes = new Map((base?.presencas ?? []).map((linha) => [linha.dbvId, linha.versao]))
  const paraPresenca = (dbvId: string) => ({ dbvId, presente: estaPresente(estado, dbvId), versaoVista: versoes.get(dbvId) ?? null })
  const presencas = base ? estado.tocadas.map(paraPresenca) : membros.map((m) => paraPresenca(m.dbvId))
  const daPropriaFicha = new Set(membros.filter((m) => m.voce).map((m) => m.dbvId))
  const pares = Object.entries(estado.acoes).flatMap(([chave, acao]) => {
    const [dbvId = '', requisitoId = ''] = chave.split('|')
    return estaPresente(estado, dbvId) && !daPropriaFicha.has(dbvId) ? [{ dbvId, requisitoId, acao }] : []
  })
  const marcados = pares.filter((p) => p.acao === 'MARCAR').map(({ dbvId, requisitoId }) => ({ dbvId, requisitoId }))
  const desmarcados = pares.filter((p) => p.acao === 'DESMARCAR').map(({ dbvId, requisitoId }) => ({ dbvId, requisitoId }))
  if (presencas.length === 0 && marcados.length === 0 && desmarcados.length === 0) return null
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
    nomes: Object.fromEntries(membros.map((m) => [m.dbvId, m.nome])),
    codigos: Object.fromEntries(requisitos.map((r) => [r.id, r.codigo])),
  }
}
