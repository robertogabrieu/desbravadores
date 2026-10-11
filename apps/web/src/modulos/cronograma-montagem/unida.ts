import { emConflito } from '@desbravadores/shared'
import type { DataDaMontagem, Montagem, RequisitoDaMontagem } from '../../api/montagem'
import { dataBloqueada } from './datas'

export type Lado = 'REGULAR' | 'AVANCADA'

export const ROTULO_DO_LADO: Record<Lado, string> = { REGULAR: 'Regular', AVANCADA: 'Avançada' }

export interface RequisitoUnido extends RequisitoDaMontagem {
  lado: Lado
}

/** O que cada classe tem numa data: a aula já dada e o conflito valem por classe, não pela data inteira. */
export interface SituacaoDoLado {
  aulaDada: boolean
  conflito: boolean
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
    const aulaDadaDaAvancada = daAvancada?.aulaDada ?? false
    const avancadaTemRequisitos = (daAvancada?.requisitoIds.length ?? 0) > 0
    // O servidor só informa o conflito da regular. Com requisito da regular na data, ele vale para as duas (mesma data,
    // mesmo "hoje"); sem, o da avançada sai da mesma regra (`emConflito`), sem corte por "hoje".
    const regularDecide = dado.requisitoIds.length > 0 && !dado.aulaDada
    const conflitoDaAvancada =
      avancadaTemRequisitos &&
      !aulaDadaDaAvancada &&
      (regularDecide
        ? dado.conflito
        : emConflito({
            trilha: 'INDIVIDUAL',
            temRequisitos: true,
            temRegistro: false,
            data: dado.data,
            hoje: dado.data,
            situacaoDaData: dado.situacao,
          }))
    const doLadoRegular: SituacaoDoLado = { aulaDada: dado.aulaDada, conflito: dado.conflito }
    return {
      ...dado,
      conflito: dado.conflito || conflitoDaAvancada,
      requisitoIds: [...dado.requisitoIds, ...(daAvancada?.requisitoIds ?? [])],
      lados: {
        REGULAR: doLadoRegular,
        // Sem avançada, o lado dela espelha o da regular: nenhuma checagem "de qualquer lado" aceita o que a regular recusa.
        AVANCADA: daAvancada ? { aulaDada: aulaDadaDaAvancada, conflito: conflitoDaAvancada } : doLadoRegular,
      },
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
