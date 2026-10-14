import type { VisaoGeral } from '../../../api/visao-geral'

export type ChamadaPendente = VisaoGeral['chamadasClasseBiblica'][number]

export type DecisaoDaChamada =
  | { tipo: 'direto'; caminho: string }
  | { tipo: 'escolha'; pares: ChamadaPendente[] }
  | { tipo: 'vazia' }

export const caminhoDaChamadaCB = ({ encontroId, grupoId }: ChamadaPendente): string =>
  `/adm/classe-biblica/encontros/${encontroId}/grupos/${grupoId}/chamada`

/** Um par pendente abre a chamada; vários pedem a escolha; nenhum abre a folha que diz que está tudo lançado. */
export function decidirChamada(pares: ChamadaPendente[]): DecisaoDaChamada {
  const [unico, ...resto] = pares
  if (unico === undefined) return { tipo: 'vazia' }
  if (resto.length === 0) return { tipo: 'direto', caminho: caminhoDaChamadaCB(unico) }
  return { tipo: 'escolha', pares }
}
