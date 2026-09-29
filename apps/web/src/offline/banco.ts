import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { EuSaida, PacoteSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import type { ItemFila } from './tipos'

export interface RegistroSessao {
  usuarioId: string
  eu: z.infer<typeof EuSaida>
  ultimoContatoEm: number
}

export interface RegistroPacote {
  usuarioId: string
  vinculoId: string
  pacote: z.infer<typeof PacoteSaida>
  baixadoEm: number
}

export interface Rascunho {
  usuarioId: string
  chave: string
  valor: unknown
  atualizadoEm: number
}

/** Banco local `desbravador` v1 (SPEC Fase 1 E5): tudo o que fica no aparelho. */
class BancoDesbravador extends Dexie {
  sessoes!: Table<RegistroSessao, string>
  pacotes!: Table<RegistroPacote, [string, string]>
  fila!: Table<ItemFila, string>
  rascunhos!: Table<Rascunho, [string, string]>

  constructor() {
    super('desbravador')
    this.version(1).stores({
      sessoes: 'usuarioId',
      pacotes: '[usuarioId+vinculoId]',
      fila: 'id, [usuarioId+estado], chave, criadoEm',
      rascunhos: '[usuarioId+chave]',
    })
  }
}

export const banco = new BancoDesbravador()
