import { describe, expect, it } from 'vitest'
import { opcoesSentry } from './sentry'

describe('opcoesSentry', () => {
  it('fica desligado fora do build de producao', () => {
    expect(opcoesSentry({ PROD: false, MODE: 'development' }).enabled).toBe(false)
  })

  it('liga no build de producao, marcado como web', () => {
    const opcoes = opcoesSentry({ PROD: true, MODE: 'production' })
    expect(opcoes.enabled).toBe(true)
    expect(opcoes.environment).toBe('production')
    expect(opcoes.initialScope).toEqual({ tags: { app: 'web' } })
  })

  it('nao manda dado pessoal, nao grava sessao nem mede desempenho', () => {
    const opcoes = opcoesSentry({ PROD: true, MODE: 'production' })
    expect(opcoes.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    })
    expect(opcoes.tracesSampleRate ?? 0).toBe(0)
    expect(opcoes.replaysSessionSampleRate ?? 0).toBe(0)
    expect(opcoes.replaysOnErrorSampleRate ?? 0).toBe(0)
    expect(opcoes.integrations).toBeUndefined()
  })
})
