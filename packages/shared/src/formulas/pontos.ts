import { SituacaoChamada } from './situacao'

export type GatilhoCriterio =
  | 'PRESENCA'
  | 'PONTUALIDADE'
  | 'UNIFORME'
  | 'BIBLIA'
  | 'LICAO'
  | 'REQUISITO'
  | 'ESPECIALIDADE'
  | 'MANUAL'
  | 'CLASSE_BIBLICA_PRESENCA'
  | 'CLASSE_BIBLICA_PARTICIPACAO'
  | 'EVENTO_ESPECIAL_PARTICIPACAO'
  | 'EVENTO_ESPECIAL_UNIFORME'

/** Os dois critérios que carregam os pontos de um evento especial; o valor vem do evento, não do critério. */
export const GATILHOS_DO_EVENTO = ['EVENTO_ESPECIAL_PARTICIPACAO', 'EVENTO_ESPECIAL_UNIFORME'] as const

export interface Criterio {
  gatilho: GatilhoCriterio
  pontos: number
  ativo: boolean
}

export interface MarcacaoChamada {
  situacao: SituacaoChamada
  uniforme: boolean
  biblia: boolean
  licao: boolean
}

export interface PontosDoItem {
  gatilho: GatilhoCriterio
  pontos: number
}

export function pontosPorCriterio(
  marcacao: MarcacaoChamada,
  criterios: Criterio[],
): PontosDoItem[] {
  if (marcacao.situacao === 'FALTA_JUSTIFICADA' || marcacao.situacao === 'FALTA') return []

  const conquistados: Record<string, boolean> = {
    PRESENCA: true,
    PONTUALIDADE: marcacao.situacao === 'PRESENTE',
    UNIFORME: marcacao.uniforme,
    BIBLIA: marcacao.biblia,
    LICAO: marcacao.licao,
  }
  return criterios
    .filter((criterio) => criterio.ativo && conquistados[criterio.gatilho])
    .map((criterio) => ({ gatilho: criterio.gatilho, pontos: criterio.pontos }))
}

export function pontosDaChamada(
  marcacao: MarcacaoChamada,
  criterios: Criterio[],
): number {
  return pontosPorCriterio(marcacao, criterios).reduce((total, item) => total + item.pontos, 0)
}
