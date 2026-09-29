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

export interface Criterio {
  gatilho: GatilhoCriterio
  pontos: number
  ativo: boolean
}

export interface ConfigPontos {
  descontarFalta: boolean
  pontosDescontoFalta: number
}

export interface MarcacaoChamada {
  situacao: SituacaoChamada
  uniforme: boolean
  biblia: boolean
  licao: boolean
}

export interface PontosDoItem {
  gatilho: GatilhoCriterio | 'FALTA'
  pontos: number
}

export function pontosPorCriterio(
  marcacao: MarcacaoChamada,
  criterios: Criterio[],
  config: ConfigPontos,
): PontosDoItem[] {
  if (marcacao.situacao === 'FALTA_JUSTIFICADA') return []
  if (marcacao.situacao === 'FALTA') {
    return config.descontarFalta ? [{ gatilho: 'FALTA', pontos: -config.pontosDescontoFalta }] : []
  }

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
  config: ConfigPontos,
): number {
  return pontosPorCriterio(marcacao, criterios, config).reduce((total, item) => total + item.pontos, 0)
}
