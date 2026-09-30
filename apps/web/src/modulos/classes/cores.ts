import type { CSSProperties } from 'react'

/** `corToken` vem da API como nome de variável CSS ("--classe-amigo"). */
export const corDaClasse = (corToken: string): CSSProperties => ({ backgroundColor: `var(${corToken})` })
