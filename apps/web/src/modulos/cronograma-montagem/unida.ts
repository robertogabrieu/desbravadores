import type { DataDaMontagem, Montagem, RequisitoDaMontagem } from '../../api/montagem'
import { dataBloqueada } from './datas'

export type Lado = 'REGULAR' | 'AVANCADA'

export const ROTULO_DO_LADO: Record<Lado, string> = { REGULAR: 'Regular', AVANCADA: 'Avançada' }

export interface RequisitoUnido extends RequisitoDaMontagem {
  lado: Lado
}

/** O que a tela mostra: regular e avançada (quando existe) como uma lista de requisitos e uma lista de datas só. */
export interface VistaUnida {
  temAvancada: boolean
  /** "Amigo + Amigo da Natureza", ou só o nome da regular. */
  nomeDoPar: string
  nomeDaRegular: string
  nomeDaAvancada: string | null
  requisitos: RequisitoUnido[]
  /** As datas da regular, com os requisitos da avançada somados em `requisitoIds`. */
  datas: DataDaMontagem[]
  ladoPorId: Map<string, Lado>
}

export function unirMontagem(montagem: Montagem): VistaUnida {
  const avancada = montagem.avancada ?? null
  const daRegular: RequisitoUnido[] = montagem.requisitos.map((requisito) => ({ ...requisito, lado: 'REGULAR' }))
  const daAvancada: RequisitoUnido[] = (avancada?.requisitos ?? []).map((requisito) => ({ ...requisito, lado: 'AVANCADA' }))
  const requisitos = [...daRegular, ...daAvancada]
  const ladoPorId = new Map(requisitos.map((requisito) => [requisito.id, requisito.lado]))
  const idsDaAvancadaPorData = new Map((avancada?.datas ?? []).map((dado) => [dado.data, dado.requisitoIds]))
  const datas = montagem.datas.map((dado) => ({
    ...dado,
    requisitoIds: [...dado.requisitoIds, ...(idsDaAvancadaPorData.get(dado.data) ?? [])],
  }))
  return {
    temAvancada: avancada !== null,
    nomeDoPar: avancada ? `${montagem.classe.nome} + ${avancada.classe.nome}` : montagem.classe.nome,
    nomeDaRegular: montagem.classe.nome,
    nomeDaAvancada: avancada?.classe.nome ?? null,
    requisitos,
    datas,
    ladoPorId,
  }
}

/** Quantos requisitos de cada classe estão numa data. */
export function contagemDaData(vista: VistaUnida, dado: DataDaMontagem): { regular: number; avancada: number } {
  const avancada = dado.requisitoIds.filter((id) => vista.ladoPorId.get(id) === 'AVANCADA').length
  return { regular: dado.requisitoIds.length - avancada, avancada }
}

export function progressoDoLado(vista: VistaUnida, lado: Lado): { comData: number; total: number } {
  const doLado = vista.requisitos.filter((requisito) => requisito.lado === lado)
  return { comData: doLado.filter((requisito) => requisito.data !== null).length, total: doLado.length }
}

/** Mais vazias primeiro: soma das duas classes, menor antes; empata pela data; bloqueadas no fim. */
export function ordenarPorVazias(datas: DataDaMontagem[]): DataDaMontagem[] {
  return [...datas].sort((a, b) => {
    const bloqueioA = Number(dataBloqueada(a))
    const bloqueioB = Number(dataBloqueada(b))
    if (bloqueioA !== bloqueioB) return bloqueioA - bloqueioB
    if (a.requisitoIds.length !== b.requisitoIds.length) return a.requisitoIds.length - b.requisitoIds.length
    return a.data.localeCompare(b.data)
  })
}
