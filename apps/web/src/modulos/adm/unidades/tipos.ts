import { TIPOS_UNIDADE } from '@desbravadores/shared'

export type TipoUnidade = (typeof TIPOS_UNIDADE)[number]
export const TIPOS_DE_UNIDADE = TIPOS_UNIDADE

const ROTULOS: Record<TipoUnidade, string> = { MISTA: 'Mista', MASCULINA: 'Masculina', FEMININA: 'Feminina' }

export const rotuloDoTipo = (tipo: TipoUnidade): string => ROTULOS[tipo]
