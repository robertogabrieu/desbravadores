import { beforeEach, describe, expect, it } from 'vitest'
import {
  apagarSenhaDoConvite,
  esquecerAparelho,
  guardarSenhaDoConvite,
  lerAparelho,
  lerSenhaDoConvite,
  marcarPasskeyAtivada,
  recusaDoConviteVale,
  registrarRecusaDoConvite,
} from './aparelho'
import { nomeSugeridoDoAparelho } from './navegador'

const DIA_MS = 24 * 60 * 60 * 1000

beforeEach(() => {
  localStorage.clear()
  apagarSenhaDoConvite()
})

describe('aparelho', () => {
  it('JSON estragado ou de formato errado vira aparelho vazio', () => {
    localStorage.setItem('desbravadores:aparelho', '{nao e json')
    expect(lerAparelho()).toEqual({})
    localStorage.setItem('desbravadores:aparelho', JSON.stringify({ email: 3, passkey: 'sim', recusadoEm: 'ontem' }))
    expect(lerAparelho()).toEqual({})
  })

  it('"Agora não" vale por 30 dias', () => {
    const inicio = Date.UTC(2026, 9, 1)
    registrarRecusaDoConvite(inicio)
    expect(recusaDoConviteVale(inicio + 29 * DIA_MS)).toBe(true)
    expect(recusaDoConviteVale(inicio + 30 * DIA_MS)).toBe(false)
  })

  it('esquecer o aparelho tira a marca e o e-mail, mas mantém o "Agora não"', () => {
    registrarRecusaDoConvite(5)
    marcarPasskeyAtivada('ana@clube.test')
    expect(lerAparelho()).toEqual({ email: 'ana@clube.test', passkey: true, recusadoEm: 5 })
    esquecerAparelho()
    expect(lerAparelho()).toEqual({ recusadoEm: 5 })
  })
})

describe('senha do convite', () => {
  it('vale por 5 minutos e some depois', () => {
    guardarSenhaDoConvite('segredo', 1000)
    expect(lerSenhaDoConvite(1000 + 5 * 60 * 1000 - 1)).toBe('segredo')
    expect(lerSenhaDoConvite(1000 + 5 * 60 * 1000)).toBeNull()
    expect(lerSenhaDoConvite(1000)).toBeNull()
  })

  it('nunca vai para o localStorage', () => {
    guardarSenhaDoConvite('segredo')
    expect(JSON.stringify({ ...localStorage })).not.toContain('segredo')
  })

  it('apagar esquece na hora', () => {
    guardarSenhaDoConvite('segredo')
    apagarSenhaDoConvite()
    expect(lerSenhaDoConvite()).toBeNull()
  })
})

describe('nome sugerido do aparelho', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', 'Chrome no Android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'Safari no iPhone'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0', 'Edge no Windows'],
    ['alguma coisa que ninguém conhece', 'Este aparelho'],
  ])('%#', (userAgent, esperado) => {
    expect(nomeSugeridoDoAparelho(userAgent)).toBe(esperado)
  })
})
