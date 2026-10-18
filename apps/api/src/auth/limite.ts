import { SkipThrottle, Throttle, ThrottlerGuard, type ThrottlerModuleOptions } from '@nestjs/throttler'
import { Injectable, SetMetadata, applyDecorators, type ExecutionContext } from '@nestjs/common'
import { hashDoToken } from '../sessao/tokens'

const MINUTO_MS = 60 * 1000
export const HORA_MS = 60 * MINUTO_MS

interface RequisicaoDeLimite {
  ip?: string
  sessao?: { usuarioId?: string }
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

/** Usuario da sessao (as guardas globais ja rodaram); sem sessao, cai no IP. */
function usuarioDaRequisicao(req: RequisicaoDeLimite): string {
  return req.sessao?.usuarioId ? `usuario:${req.sessao.usuarioId}` : `ip:${ipDaRequisicao(req)}`
}

const MARCA_LIMITE_POR_LINK = 'limitePorLink'
const MARCA_LIMITE_POR_USUARIO = 'limitePorUsuario'

/** `porLink` so conta nas rotas que o declaram com `@LimitePorLink`; as demais seguem como antes. */
function semLimitePorLink(contexto: ExecutionContext): boolean {
  return Reflect.getMetadata(MARCA_LIMITE_POR_LINK, contexto.getHandler()) !== true
}

/** `porUsuario` so conta nas rotas que o declaram com `@LimitePorUsuario`. */
function semLimitePorUsuario(contexto: ExecutionContext): boolean {
  return Reflect.getMetadata(MARCA_LIMITE_POR_USUARIO, contexto.getHandler()) !== true
}

/** Padrao dos throttlers = limite do login; cada rota declara o seu com `@Throttle`. */
export const OPCOES_DE_LIMITE: ThrottlerModuleOptions = {
  throttlers: [
    { name: 'porEmail', ttl: MINUTO_MS, limit: 5, getTracker: emailDaRequisicao },
    { name: 'porIp', ttl: MINUTO_MS, limit: 20, getTracker: ipDaRequisicao },
    { name: 'porLink', ttl: MINUTO_MS, limit: 10, getTracker: linkDaRequisicao, skipIf: semLimitePorLink },
    { name: 'porUsuario', ttl: MINUTO_MS, limit: 10, getTracker: usuarioDaRequisicao, skipIf: semLimitePorUsuario },
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
/** Agenda dos pais: leitura aberta, e a familia toda da igreja compartilha o IP; so o limite por IP, mais folgado que o do login. */
export const LIMITE_AGENDA_PUBLICA = { porIp: { limit: 120, ttl: MINUTO_MS } }
/**
 * Login por passkey: sem e-mail no corpo, e o `LIMITE_POR_IP` (10 por hora) trancaria uma igreja
 * inteira atras do mesmo wi-fi. So o IP, folgado.
 */
export const LIMITE_PASSKEY_LOGIN = { porIp: { limit: 60, ttl: MINUTO_MS } }
/** Confere a senha da conta: 5 por usuario a cada 15 min, senao viraria oraculo de senha para quem roubou um access token. */
export const LIMITE_PASSKEY_OPCOES_DE_CADASTRO = { limite: 5, ttl: 15 * MINUTO_MS }
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

/** Limite por usuario da sessao, sem o do e-mail nem o do IP (wi-fi compartilhado). */
export function LimitePorUsuario(limite: number, ttl: number): MethodDecorator {
  return applyDecorators(
    SetMetadata(MARCA_LIMITE_POR_USUARIO, true),
    SkipThrottle({ porEmail: true, porIp: true }),
    Throttle({ porUsuario: { limit: limite, ttl } }),
  )
}
