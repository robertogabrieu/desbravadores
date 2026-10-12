import { definicaoDaRegra } from '@desbravadores/shared'
import type { RegraDoClube } from '../../../api/ranking-regras'

/** Soma das regras ligadas do grupo da reunião: o que um desbravador ganha numa reunião perfeita. */
export function pontosDaReuniaoPerfeita(regras: RegraDoClube[]): number {
  return regras.filter((r) => r.ativo && definicaoDaRegra(r.gatilho).grupo === 'reuniao').reduce((soma, r) => soma + r.pontos, 0)
}
