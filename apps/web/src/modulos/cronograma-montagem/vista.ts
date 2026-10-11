import type { DataDaMontagem, Montagem, RequisitoDaMontagem } from '../../api/montagem'
import type { Classe } from '../../api/leitura'
import { dataBloqueada } from './datas'
import { nomeDoPar } from './classes'

export type Lado = 'REGULAR' | 'AVANCADA'

export const ROTULO_DO_LADO: Record<Lado, string> = { REGULAR: 'Regular', AVANCADA: 'Avançada' }

export interface RequisitoComLado extends RequisitoDaMontagem {
  lado: Lado
  /** Só no requisito de uma avançada que já não anda com a regular (par desfeito): o nome da classe dele. */
  nomeDaClasse: string | null
}

/** O que a tela mostra: o cronograma único, com os requisitos das duas classes (quando há avançada) já marcados com o lado. */
export interface VistaDoPar {
  temAvancada: boolean
  /** "Amigo + Amigo da Natureza", ou só o nome da regular. */
  nomeDoPar: string
  nomeDaRegular: string
  nomeDaAvancada: string | null
  /** As classes do cronograma: a dona e, no par, a avançada. */
  classeIds: string[]
  requisitos: RequisitoComLado[]
  datas: DataDaMontagem[]
}

/**
 * O lado de um requisito é "Regular" se a classe dele é a dona do cronograma; senão é "Avançada", também depois de o par
 * se desfazer (o requisito fica no cronograma até ser tirado). `classes` dá o nome dessa classe fora do par.
 */
export function montarVista(montagem: Montagem, classes: Classe[] = []): VistaDoPar {
  const avancada = montagem.avancada
  const donaId = montagem.classe.id
  const requisitos = montagem.requisitos.map((requisito): RequisitoComLado => {
    const lado: Lado = requisito.classeId === donaId ? 'REGULAR' : 'AVANCADA'
    const foraDoPar = lado === 'AVANCADA' && requisito.classeId !== avancada?.id
    return { ...requisito, lado, nomeDaClasse: foraDoPar ? (classes.find((classe) => classe.id === requisito.classeId)?.nome ?? null) : null }
  })
  const classeFora = requisitos.find((requisito) => requisito.lado === 'AVANCADA' && requisito.classeId !== avancada?.id)
  const temAvancada = avancada !== null || classeFora !== undefined
  const nomeDaAvancada = avancada?.nome ?? classeFora?.nomeDaClasse ?? null
  return {
    temAvancada,
    nomeDoPar: nomeDoPar(montagem.classe.nome, nomeDaAvancada),
    nomeDaRegular: montagem.classe.nome,
    nomeDaAvancada,
    classeIds: avancada ? [donaId, avancada.id] : [donaId],
    requisitos,
    datas: montagem.datas,
  }
}

/** A classe já registrou aula nesta data: o requisito dela fica travado. */
export const classeDada = (dado: DataDaMontagem, classeId: string): boolean => dado.classeIdsComAulaDada.includes(classeId)

/** Editar ou remover o dia: há aula e nenhuma classe já deu aula nela. */
export const diaPodeMudar = (dado: DataDaMontagem): boolean => dado.aulaId !== null && dado.classeIdsComAulaDada.length === 0

/** Quantos requisitos de cada classe estão numa data. */
export function contagemDaData(vista: VistaDoPar, dado: DataDaMontagem): { regular: number; avancada: number } {
  const ladoPorId = new Map(vista.requisitos.map((requisito) => [requisito.id, requisito.lado]))
  const avancada = dado.requisitoIds.filter((id) => ladoPorId.get(id) === 'AVANCADA').length
  return { regular: dado.requisitoIds.length - avancada, avancada }
}

/**
 * "Classe dada" na data: toda classe que tem requisito nela já registrou aula. Sem requisito nenhum na data,
 * basta alguma classe ter dado a aula.
 */
export function aulaDadaPorTodas(dado: DataDaMontagem, requisitosDaData: RequisitoComLado[]): boolean {
  const classes = new Set(requisitosDaData.map((requisito) => requisito.classeId))
  if (classes.size === 0) return dado.classeIdsComAulaDada.length > 0
  return [...classes].every((classeId) => dado.classeIdsComAulaDada.includes(classeId))
}

export function progressoDoLado(vista: VistaDoPar, lado: Lado): { comData: number; total: number } {
  const doLado = vista.requisitos.filter((requisito) => requisito.lado === lado)
  return { comData: doLado.filter((requisito) => requisito.data !== null).length, total: doLado.length }
}

/** Mais vazias primeiro: menor número de requisitos antes; empata pela data; bloqueadas no fim. */
export function ordenarPorVazias(datas: DataDaMontagem[]): DataDaMontagem[] {
  return [...datas].sort((a, b) => {
    const bloqueioA = Number(dataBloqueada(a))
    const bloqueioB = Number(dataBloqueada(b))
    if (bloqueioA !== bloqueioB) return bloqueioA - bloqueioB
    if (a.requisitoIds.length !== b.requisitoIds.length) return a.requisitoIds.length - b.requisitoIds.length
    return a.data.localeCompare(b.data)
  })
}
