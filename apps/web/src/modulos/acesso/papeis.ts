import type { Papel } from '@desbravadores/shared'

const ROTULOS: Record<Papel, string> = { ADM: 'Adm', CONSELHEIRO: 'Conselheiro', INSTRUTOR: 'Instrutor' }

export const rotuloDoPapel = (papel: Papel): string => ROTULOS[papel]
