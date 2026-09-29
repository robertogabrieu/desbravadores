import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { reiniciarCliente } from '../api/cliente'
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

afterEach(() => {
  cleanup()
  servidor.resetHandlers()
  reiniciarCliente()
})

afterAll(() => {
  servidor.close()
})
