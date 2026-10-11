import type { DataDaMontagem, Montagem, RequisitoDaMontagem } from '../../api/montagem'
import { dataBloqueada } from './datas'

export type Lado = 'REGULAR' | 'AVANCADA'

export const ROTULO_DO_LADO: Record<Lado, string> = { REGULAR: 'Regular', AVANCADA: 'Avançada' }

export interface RequisitoUnido extends RequisitoDaMontagem {
  lado: Lado
}

/** O que cada classe tem numa data: a aula já dada e o conflito valem por classe, não pela data inteira. */
export interface SituacaoDoLado {
  /** A aula planejada da classe nesta data, se existir. */
  aulaId: string | null
  aulaDada: boolean
  conflito: boolean
  /** Quantos requisitos da classe estão nesta data. */
  quantidade: number
}

/**
 * Data da regular com os requisitos da avançada somados. `aulaDada` continua sendo o da regular; `conflito` é o de
 * qualquer das duas (a linha avisa); o detalhe de cada classe está em `lados`.
 */
export interface DataUnida extends DataDaMontagem {
  lados: Record<Lado, SituacaoDoLado>
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
  datas: DataUnida[]
  ladoPorId: Map<string, Lado>
}

export function unirMontagem(montagem: Montagem): VistaUnida {
  const avancada = montagem.avancada ?? null
  const daRegular: RequisitoUnido[] = montagem.requisitos.map((requisito) => ({ ...requisito, lado: 'REGULAR' }))
  const daAvancada: RequisitoUnido[] = (avancada?.requisitos ?? []).map((requisito) => ({ ...requisito, lado: 'AVANCADA' }))
  const requisitos = [...daRegular, ...daAvancada]
  const ladoPorId = new Map(requisitos.map((requisito) => [requisito.id, requisito.lado]))
  const avancadaPorData = new Map((avancada?.datas ?? []).map((dado) => [dado.data, dado]))
  const datas = montagem.datas.map((dado): DataUnida => {
    const daAvancada = avancadaPorData.get(dado.data)
    const doLadoRegular: SituacaoDoLado = {
      aulaId: dado.aulaId,
      aulaDada: dado.aulaDada,
      conflito: dado.conflito,
      quantidade: dado.requisitoIds.length,
    }
    // Sem avançada, o lado dela espelha o da regular: nenhuma checagem "de qualquer lado" aceita o que a regular recusa.
    const doLadoAvancada: SituacaoDoLado = daAvancada
      ? {
          aulaId: daAvancada.aulaId,
          aulaDada: daAvancada.aulaDada,
          conflito: daAvancada.conflito,
          quantidade: daAvancada.requisitoIds.length,
        }
      : doLadoRegular
    return {
      ...dado,
      conflito: dado.conflito || doLadoAvancada.conflito,
      requisitoIds: [...dado.requisitoIds, ...(daAvancada?.requisitoIds ?? [])],
      lados: { REGULAR: doLadoRegular, AVANCADA: doLadoAvancada },
    }
  })
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

/** As aulas planejadas desta data, uma por classe que tem: o dia da linha é o encontro das duas. */
export function aulasDaData(dado: DataUnida): string[] {
  const ids = [dado.lados.REGULAR.aulaId, dado.lados.AVANCADA.aulaId].filter((id): id is string => id !== null)
  return [...new Set(ids)]
}

/** Editar ou remover o dia: há aula e nenhuma das que existem já foi dada. */
export function diaPodeMudar(dado: DataUnida): boolean {
  const lados = [dado.lados.REGULAR, dado.lados.AVANCADA]
  return lados.some((lado) => lado.aulaId !== null) && lados.every((lado) => lado.aulaId === null || !lado.aulaDada)
}

/** Quantos requisitos de cada classe estão numa data. */
export function contagemDaData(vista: VistaUnida, dado: DataUnida): { regular: number; avancada: number } {
  const avancada = dado.requisitoIds.filter((id) => vista.ladoPorId.get(id) === 'AVANCADA').length
  return { regular: dado.requisitoIds.length - avancada, avancada }
}

export function progressoDoLado(vista: VistaUnida, lado: Lado): { comData: number; total: number } {
  const doLado = vista.requisitos.filter((requisito) => requisito.lado === lado)
  return { comData: doLado.filter((requisito) => requisito.data !== null).length, total: doLado.length }
}

/** Mais vazias primeiro: soma das duas classes, menor antes; empata pela data; bloqueadas no fim. */
export function ordenarPorVazias(datas: DataUnida[]): DataUnida[] {
  return [...datas].sort((a, b) => {
    const bloqueioA = Number(dataBloqueada(a))
    const bloqueioB = Number(dataBloqueada(b))
    if (bloqueioA !== bloqueioB) return bloqueioA - bloqueioB
    if (a.requisitoIds.length !== b.requisitoIds.length) return a.requisitoIds.length - b.requisitoIds.length
    return a.data.localeCompare(b.data)
  })
}
