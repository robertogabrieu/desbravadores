import { captureException } from '@sentry/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registrarServiceWorker } from './registrarServiceWorker'

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

function simularServiceWorker(register: () => Promise<unknown>, controller: unknown): void {
  Object.defineProperty(navigator, 'serviceWorker', { value: { register, controller }, configurable: true })
}

describe('registrarServiceWorker', () => {
  afterEach(() => vi.mocked(captureException).mockClear())

  it('registra /sw.js e não reporta nada quando dá certo', async () => {
    const register = vi.fn().mockResolvedValue({})
    simularServiceWorker(register, null)

    await registrarServiceWorker()

    expect(register).toHaveBeenCalledWith('/sw.js')
    expect(captureException).not.toHaveBeenCalled()
  })

  it('em falha, reporta com a tag, o erro, o escopo e se já havia controller', async () => {
    const falha = new TypeError('Rejected')
    simularServiceWorker(() => Promise.reject(falha), {})

    await registrarServiceWorker()

    const [enviado, opcoes] = vi.mocked(captureException).mock.calls[0] ?? []
    expect(enviado).toBe(falha)
    expect(opcoes).toMatchObject({
      tags: { 'service-worker': 'registro-falhou' },
      extra: { name: 'TypeError', message: 'Rejected', jaHaviaController: true },
    })
    expect(JSON.stringify(opcoes)).toMatch(/"scope":"[^"]*\/"/)
  })

  it('sem controller, informa jaHaviaController falso', async () => {
    simularServiceWorker(() => Promise.reject(new Error('x')), null)

    await registrarServiceWorker()

    expect(vi.mocked(captureException).mock.calls[0]?.[1]).toMatchObject({ extra: { jaHaviaController: false } })
  })
})
