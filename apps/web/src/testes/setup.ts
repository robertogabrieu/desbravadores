import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { reiniciarCliente } from '../api/cliente'
import { reiniciarOffline } from '../offline/reiniciar'
import { instalarLocksDeTeste } from './locks'
import { simularLargura } from './midia'
import { servidor } from './servidor'

beforeAll(() => {
  instalarLocksDeTeste()
  servidor.listen({ onUnhandledRequest: 'error' })
})

beforeEach(() => {
  simularLargura(1280)
})

afterEach(async () => {
  cleanup()
  servidor.resetHandlers()
  reiniciarCliente()
  await reiniciarOffline()
})

afterAll(() => {
  servidor.close()
})
