import type { CookieOptions, Request, Response } from 'express'
import { VALIDADE_FAMILIA_MS } from '../sessao/refresh.service'

export const COOKIE_REFRESH = 'refresh'
const CAMINHO_DO_COOKIE = '/api/auth'

function opcoesDoCookie(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: CAMINHO_DO_COOKIE,
    // Desligavel so em dev/teste (SPEC D8).
    secure: process.env['COOKIE_SECURE'] !== 'false',
  }
}

export function gravarCookieDoRefresh(resposta: Response, token: string): void {
  resposta.cookie(COOKIE_REFRESH, token, { ...opcoesDoCookie(), maxAge: VALIDADE_FAMILIA_MS })
}

export function limparCookieDoRefresh(resposta: Response): void {
  resposta.clearCookie(COOKIE_REFRESH, opcoesDoCookie())
}

export function lerCookieDoRefresh(req: Request): string | undefined {
  const valor: unknown = (req.cookies as Record<string, unknown> | undefined)?.[COOKIE_REFRESH]
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined
}
