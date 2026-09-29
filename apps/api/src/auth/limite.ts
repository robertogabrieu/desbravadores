import { ThrottlerGuard, type ThrottlerModuleOptions } from '@nestjs/throttler'
import { Injectable } from '@nestjs/common'

const MINUTO_MS = 60 * 1000
export const HORA_MS = 60 * MINUTO_MS

interface RequisicaoDeLimite {
  ip?: string
  body?: unknown
}

function ipDaRequisicao(req: RequisicaoDeLimite): string {
  return req.ip ?? 'sem-ip'
}

/** E-mail normalizado do corpo (mesma regra do contrato); sem e-mail valido, cai no IP. */
function emailDaRequisicao(req: RequisicaoDeLimite): string {
  const corpo = req.body as { email?: unknown } | undefined
  if (typeof corpo?.email !== 'string') return `ip:${ipDaRequisicao(req)}`
  return corpo.email.trim().toLowerCase()
}

/** Padrao dos throttlers = limite do login; cada rota declara o seu com `@Throttle`. */
export const OPCOES_DE_LIMITE: ThrottlerModuleOptions = {
  throttlers: [
    { name: 'porEmail', ttl: MINUTO_MS, limit: 5, getTracker: emailDaRequisicao },
    { name: 'porIp', ttl: MINUTO_MS, limit: 20, getTracker: ipDaRequisicao },
  ],
}

/** Guarda propria (e nao a global) para o teste poder troca-la; so as rotas de auth limitadas a usam. */
@Injectable()
export class GuardaLimite extends ThrottlerGuard {}

export const LIMITE_LOGIN = {
  porEmail: { limit: 5, ttl: MINUTO_MS },
  porIp: { limit: 20, ttl: MINUTO_MS },
}
export const LIMITE_ESQUECI = {
  porEmail: { limit: 3, ttl: HORA_MS },
  porIp: { limit: 10, ttl: HORA_MS },
}
export const LIMITE_POR_IP = { porIp: { limit: 10, ttl: HORA_MS } }
