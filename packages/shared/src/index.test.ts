import { describe, expect, it } from 'vitest'
import { NOME_SISTEMA } from './index'

describe('shared', () => {
  it('exporta o nome do sistema', () => {
    expect(NOME_SISTEMA).toBe('Desbravadores')
  })
})
