import { horarioELocalDoDia, instanteDoHorario, type SituacaoDeData } from '@desbravadores/shared'
import type { TipoSubstituicao } from '../generated/prisma/client.js'

const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS
/** O link abre no início da reunião e fecha 3 h depois. */
export const DURACAO_DA_JANELA_MS = 3 * HORA_MS
/** O que foi salvo no aparelho ainda sobe até 12 h depois do fim (S5). */
export const PRAZO_DE_ENVIO_MS = 12 * HORA_MS
export const DIAS_ELEGIVEIS_A_FRENTE = 28

export interface Janela {
  data: string
  inicioEm: Date
  fimEm: Date
  fimEnvioEm: Date
}

export function janelaDoDia(data: string, horario: string, fuso: string): Janela {
  const inicioEm = instanteDoHorario(data, horario, fuso)
  const fimEm = new Date(inicioEm.getTime() + DURACAO_DA_JANELA_MS)
  return { data, inicioEm, fimEm, fimEnvioEm: new Date(fimEm.getTime() + PRAZO_DE_ENVIO_MS) }
}

/** Última data civil elegível, contando de `hoje`. */
export function ultimoDiaElegivel(hoje: string): string {
  return new Date(Date.parse(`${hoje}T00:00:00Z`) + DIAS_ELEGIVEIS_A_FRENTE * DIA_MS).toISOString().slice(0, 10)
}

/**
 * Dias com reunião (link de unidade) ou com classe (link de classe), com a janela de cada um no
 * fuso do clube. O dia cujo fim já passou fica de fora.
 */
export function janelasElegiveis(
  situacoes: ReadonlyMap<string, SituacaoDeData>,
  tipo: TipoSubstituicao,
  clube: { horaReuniao: string; fuso: string },
  agora: Date,
): Janela[] {
  const janelas: Janela[] = []
  for (const [data, situacao] of situacoes) {
    if (!(tipo === 'CHAMADA' ? situacao.temReuniao : situacao.temClasse)) continue
    const { horario } = horarioELocalDoDia(situacao, { horario: clube.horaReuniao, local: null })
    const janela = janelaDoDia(data, horario, clube.fuso)
    if (janela.fimEm > agora) janelas.push(janela)
  }
  return janelas
}
