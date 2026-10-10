import { SkipThrottle, Throttle, ThrottlerGuard, type ThrottlerModuleOptions } from '@nestjs/throttler'
import { Injectable, SetMetadata, applyDecorators, type ExecutionContext } from '@nestjs/common'
import { hashDoToken } from '../sessao/tokens'

const MINUTO_MS = 60 * 1000
export const HORA_MS = 60 * MINUTO_MS

interface RequisicaoDeLimite {
  ip?: string
  body?: unknown
  params?: Record<string, unknown>
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

/** Hash do token da rota: num wi-fi de igreja varios substitutos dividem o IP, cada um com o seu link. */
function linkDaRequisicao(req: RequisicaoDeLimite): string {
  const token = req.params?.['token']
  return typeof token === 'string' ? `link:${hashDoToken(token)}` : `ip:${ipDaRequisicao(req)}`
}

const MARCA_LIMITE_POR_LINK = 'limitePorLink'

/** `porLink` so conta nas rotas que o declaram com `@LimitePorLink`; as demais seguem como antes. */
function semLimitePorLink(contexto: ExecutionContext): boolean {
  return Reflect.getMetadata(MARCA_LIMITE_POR_LINK, contexto.getHandler()) !== true
}

/** Padrao dos throttlers = limite do login; cada rota declara o seu com `@Throttle`. */
export const OPCOES_DE_LIMITE: ThrottlerModuleOptions = {
  throttlers: [
    { name: 'porEmail', ttl: MINUTO_MS, limit: 5, getTracker: emailDaRequisicao },
    { name: 'porIp', ttl: MINUTO_MS, limit: 20, getTracker: ipDaRequisicao },
    { name: 'porLink', ttl: MINUTO_MS, limit: 10, getTracker: linkDaRequisicao, skipIf: semLimitePorLink },
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
/** Aceite do convite por link: senha errada nao gasta o convite, entao o e-mail tem o limite do login. */
export const LIMITE_ACEITE_POR_LINK = { porEmail: LIMITE_LOGIN.porEmail, ...LIMITE_POR_IP }

/** Link de substituicao: so o limite pelo hash do token, sem o do e-mail (cairia no IP) nem o do IP. */
export function LimitePorLink(limite: number): MethodDecorator {
  return applyDecorators(
    SetMetadata(MARCA_LIMITE_POR_LINK, true),
    SkipThrottle({ porEmail: true, porIp: true }),
    Throttle({ porLink: { limit: limite, ttl: MINUTO_MS } }),
  )
}
