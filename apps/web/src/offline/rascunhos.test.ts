import { describe, expect, it } from 'vitest'
import { banco } from './banco'
import { apagarRascunho, gravarRascunho, lerRascunho } from './index'
import { limparDadosDoUsuario } from './index'

describe('rascunhos', () => {
  it('lê nulo quando não há rascunho', async () => {
    expect(await lerRascunho('u1', 'a')).toBeNull()
  })

  it('grava e lê o valor cru, com atualizadoEm', async () => {
    const antes = Date.now()
    await gravarRascunho('u1', 'unidade:2030-01-06', { presentes: ['x'] })
    expect(await lerRascunho('u1', 'unidade:2030-01-06')).toEqual({ presentes: ['x'] })
    const registro = await banco.rascunhos.get(['u1', 'unidade:2030-01-06'])
    expect(registro?.atualizadoEm).toBeGreaterThanOrEqual(antes)
  })

  it('gravar de novo sobrescreve', async () => {
    await gravarRascunho('u1', 'a', 1)
    await gravarRascunho('u1', 'a', 2)
    expect(await lerRascunho('u1', 'a')).toBe(2)
  })

  it('apaga só a chave pedida', async () => {
    await gravarRascunho('u1', 'a', 1)
    await gravarRascunho('u1', 'b', 2)
    await apagarRascunho('u1', 'a')
    expect(await lerRascunho('u1', 'a')).toBeNull()
    expect(await lerRascunho('u1', 'b')).toBe(2)
  })

  it('apagar o que não existe não falha', async () => {
    await expect(apagarRascunho('u1', 'nada')).resolves.toBeUndefined()
  })

  it('isola por usuário', async () => {
    await gravarRascunho('u1', 'a', 'do-um')
    await gravarRascunho('u2', 'a', 'do-dois')
    expect(await lerRascunho('u1', 'a')).toBe('do-um')
    await apagarRascunho('u2', 'a')
    expect(await lerRascunho('u1', 'a')).toBe('do-um')
    expect(await lerRascunho('u2', 'a')).toBeNull()
  })

  it('limparDadosDoUsuario apaga os rascunhos dele e mantém os de outro', async () => {
    await gravarRascunho('u1', 'a', 1)
    await gravarRascunho('u2', 'a', 2)
    await limparDadosDoUsuario('u1', { manterFila: true })
    expect(await lerRascunho('u1', 'a')).toBeNull()
    expect(await lerRascunho('u2', 'a')).toBe(2)
  })
})
