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

export function pontosDaChamada(
  marcacao: MarcacaoChamada,
  criterios: Criterio[],
  config: ConfigPontos,
): number {
  if (marcacao.situacao === 'FALTA_JUSTIFICADA') return 0
  if (marcacao.situacao === 'FALTA') return config.descontarFalta ? -config.pontosDescontoFalta : 0

  const conquistados: Record<string, boolean> = {
    PRESENCA: true,
    PONTUALIDADE: marcacao.situacao === 'PRESENTE',
    UNIFORME: marcacao.uniforme,
    BIBLIA: marcacao.biblia,
    LICAO: marcacao.licao,
  }
  return criterios
    .filter((criterio) => criterio.ativo && conquistados[criterio.gatilho])
    .reduce((total, criterio) => total + criterio.pontos, 0)
}
