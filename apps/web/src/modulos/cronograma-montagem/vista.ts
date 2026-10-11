import type { DataDaMontagem, Montagem, RequisitoDaMontagem } from '../../api/montagem'
import { dataBloqueada } from './datas'

export type Lado = 'REGULAR' | 'AVANCADA'

export const ROTULO_DO_LADO: Record<Lado, string> = { REGULAR: 'Regular', AVANCADA: 'Avançada' }

export interface RequisitoComLado extends RequisitoDaMontagem {
  lado: Lado
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

export function montarVista(montagem: Montagem): VistaDoPar {
  const avancada = montagem.avancada
  const requisitos = montagem.requisitos.map((requisito): RequisitoComLado => ({
    ...requisito,
    lado: avancada !== null && requisito.classeId === avancada.id ? 'AVANCADA' : 'REGULAR',
  }))
  return {
    temAvancada: avancada !== null,
    nomeDoPar: avancada ? `${montagem.classe.nome} + ${avancada.nome}` : montagem.classe.nome,
    nomeDaRegular: montagem.classe.nome,
    nomeDaAvancada: avancada?.nome ?? null,
    classeIds: avancada ? [montagem.classe.id, avancada.id] : [montagem.classe.id],
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
