import { breadcrumbsIntegration, type Breadcrumb, type ErrorEvent } from '@sentry/react'
import { describe, expect, it, vi } from 'vitest'
import { opcoesSentry } from './sentry'

vi.mock('@sentry/react', async (importarOriginal) => {
  const original = await importarOriginal<typeof import('@sentry/react')>()
  return { ...original, breadcrumbsIntegration: vi.fn(original.breadcrumbsIntegration) }
})

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
  })

  it('não registra cliques nem console nas migalhas, e não acrescenta tracing nem replay', () => {
    const montar = opcoesSentry({ PROD: true, MODE: 'production' }).integrations as (
      padrao: { name: string }[],
    ) => { name: string }[]
    const padrao = ['Dedupe', 'Console', 'Breadcrumbs'].map((name) => ({ name }))
    expect(montar(padrao).map((integracao) => integracao.name)).toEqual(['Dedupe', 'Breadcrumbs'])
    expect(breadcrumbsIntegration).toHaveBeenCalledWith({ dom: false })
  })

  it('tira do evento o token do caminho, a query, o #hash e o mesmo no Referer', () => {
    const limpar = opcoesSentry({ PROD: true, MODE: 'production' }).beforeSend
    const evento = {
      type: undefined,
      request: {
        url: 'https://app.exemplo/convite/abc123?x=1#y',
        query_string: 'x=1',
        headers: { Referer: 'https://app.exemplo/senha/redefinir/def456' },
      },
    } as ErrorEvent
    const limpo = limpar?.(evento, {}) as ErrorEvent
    expect(limpo.request?.url).toBe('https://app.exemplo/convite/:token')
    expect(limpo.request?.query_string).toBeUndefined()
    expect(limpo.request?.headers?.['Referer']).toBe('https://app.exemplo/senha/redefinir/:token')
  })

  it('limpa o endereço das migalhas de navegação, fetch e xhr', () => {
    const limpar = opcoesSentry({ PROD: true, MODE: 'production' }).beforeBreadcrumb
    const navegacao = limpar?.({ category: 'navigation', data: { from: '/acesso/abc123', to: '/inicio#topo' } })
    expect(navegacao?.data).toEqual({ from: '/acesso/:token', to: '/inicio' })
    const pedido = limpar?.({ category: 'fetch', data: { url: '/api/arquivos/f.jpg?assinatura=xyz', method: 'GET' } })
    expect(pedido?.data).toEqual({ url: '/api/arquivos/f.jpg', method: 'GET' })
    const xhr = limpar?.({ category: 'xhr', data: { url: '/api/convite-acesso/abc123' } } as Breadcrumb)
    expect(xhr?.data?.['url']).toBe('/api/convite-acesso/:token')
  })

  it('descarta as migalhas do console', () => {
    const limpar = opcoesSentry({ PROD: true, MODE: 'production' }).beforeBreadcrumb
    expect(limpar?.({ category: 'console', message: 'dados da tela' })).toBeNull()
  })
})
