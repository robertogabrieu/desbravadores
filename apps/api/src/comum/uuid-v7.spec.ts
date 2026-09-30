import { gerarUuidV7 } from './uuid-v7'

describe('gerarUuidV7', () => {
  it('tem o formato canonico, versao 7 e variante 10', () => {
    for (let i = 0; i < 50; i++) {
      expect(gerarUuidV7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    }
  })

  it('guarda o instante nos 48 primeiros bits', () => {
    const id = gerarUuidV7(1_700_000_000_123)
    expect(parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(1_700_000_000_123)
  })

  it('ids de milissegundos diferentes ordenam como texto na ordem em que foram gerados', () => {
    const ids = [1_700_000_000_000, 1_700_000_000_001, 1_700_000_000_500, 1_700_000_100_000].map((ms) => gerarUuidV7(ms))
    expect([...ids].sort()).toEqual(ids)
  })

  it('duas chamadas no mesmo instante diferem', () => {
    expect(gerarUuidV7(1_700_000_000_000)).not.toBe(gerarUuidV7(1_700_000_000_000))
  })
})
