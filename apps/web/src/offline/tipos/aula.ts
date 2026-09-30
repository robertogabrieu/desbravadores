import { AulaEnvio, AulaEnvioSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { registrarTipo } from '../index'

/** Payload do item AULA (chave `aula:<classeId>:<data>`). O pacote B1 escreve; o histórico lê. */
export interface PayloadAulaFila {
  /** O `:uuid` do PUT: id do registro existente, ou UUID novo gerado no aparelho. */
  registroAulaId: string
  /** `true` quando o registro já existia (rótulo de correção). */
  correcao: boolean
  classeNome: string
  corpo: z.infer<typeof AulaEnvio>
}

const rotulo = (payload: PayloadAulaFila): string => `Aula · ${payload.classeNome}`

const detalhe = (): string => ''

const fundir = (_anterior: PayloadAulaFila, novo: PayloadAulaFila): PayloadAulaFila => novo

const enviar = (): Promise<unknown> => Promise.reject(new Error('não implementado'))

registrarTipo({ tipo: 'AULA', rotulo, detalhe, fundir, enviar, saida: AulaEnvioSaida })
