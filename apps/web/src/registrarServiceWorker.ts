import { captureException } from '@sentry/react'

const CAMINHO_DO_SW = '/sw.js'

/** Registra o service worker; a falha vai ao Sentry com o que separa "navegador recusou" de "página já controlada". */
export async function registrarServiceWorker(): Promise<void> {
  try {
    await navigator.serviceWorker.register(CAMINHO_DO_SW)
  } catch (causa) {
    const erro = causa instanceof Error ? causa : new Error(String(causa))
    captureException(erro, {
      tags: { 'service-worker': 'registro-falhou' },
      extra: {
        name: erro.name,
        message: erro.message,
        scope: new URL('/', window.location.href).href,
        jaHaviaController: navigator.serviceWorker.controller != null,
      },
    })
  }
}
