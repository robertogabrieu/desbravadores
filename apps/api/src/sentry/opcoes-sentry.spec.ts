import type { ErrorEvent } from '@sentry/nestjs'
import { opcoesSentry } from './opcoes-sentry'

describe('opcoesSentry', () => {
  it('fica desligado fora de producao', () => {
    expect(opcoesSentry({ NODE_ENV: 'test' }).enabled).toBe(false)
    expect(opcoesSentry({}).enabled).toBe(false)
  })

  it('liga em producao, marcado como api e com a versao do commit', () => {
    const opcoes = opcoesSentry({ NODE_ENV: 'production', VERSAO_APP: 'abc123' })
    expect(opcoes.enabled).toBe(true)
    expect(opcoes.environment).toBe('production')
    expect(opcoes.release).toBe('abc123')
    expect(opcoes.initialScope).toEqual({ tags: { app: 'api' } })
  })

  it('nao manda dado pessoal nem mede desempenho', () => {
    const opcoes = opcoesSentry({ NODE_ENV: 'production' })
    expect(opcoes.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    })
    expect(opcoes.tracesSampleRate ?? 0).toBe(0)
    expect(opcoes.release).toBeUndefined()
  })

  it('tira do evento o token do caminho e a query, inclusive no nome da transação', () => {
    const limpar = opcoesSentry({ NODE_ENV: 'production' }).beforeSend
    const evento = {
      type: undefined,
      transaction: 'GET /api/acesso/abc123',
      request: { url: 'https://app.exemplo/api/acesso/abc123?assinatura=xyz', query_string: 'assinatura=xyz' },
    } as ErrorEvent
    const limpo = limpar?.(evento, {}) as ErrorEvent
    expect(limpo.request?.url).toBe('https://app.exemplo/api/acesso/:token')
    expect(limpo.request?.query_string).toBeUndefined()
    expect(limpo.transaction).toBe('GET /api/acesso/:token')
  })
})
