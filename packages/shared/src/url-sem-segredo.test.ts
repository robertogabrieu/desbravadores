import { describe, expect, it } from 'vitest'
import { urlSemSegredo } from './url-sem-segredo'

describe('urlSemSegredo', () => {
  it.each([
    ['https://app.exemplo/convite/abc123', 'https://app.exemplo/convite/:token'],
    ['/acesso/abc123', '/acesso/:token'],
    ['/senha/redefinir/abc123', '/senha/redefinir/:token'],
    ['/api/convite-acesso/abc123', '/api/convite-acesso/:token'],
    ['/api/acesso/abc123', '/api/acesso/:token'],
    ['https://app.exemplo/substituto/abc123/chamada', 'https://app.exemplo/substituto/:token/chamada'],
    ['/api/auth/substituicao/abc123', '/api/auth/substituicao/:token'],
    ['POST /api/auth/substituicao/abc123/entrar', 'POST /api/auth/substituicao/:token/entrar'],
  ])('mascara o token do caminho: %s', (url, esperado) => {
    expect(urlSemSegredo(url)).toBe(esperado)
  })

  it('tira a query e o #hash (a assinatura de /api/arquivos/ vai na query)', () => {
    expect(urlSemSegredo('https://app.exemplo/api/arquivos/foto.jpg?assinatura=xyz&expira=1#topo')).toBe(
      'https://app.exemplo/api/arquivos/foto.jpg',
    )
    expect(urlSemSegredo('/acesso/abc123#x')).toBe('/acesso/:token')
  })

  it('mascara também dentro do nome de transação da API', () => {
    expect(urlSemSegredo('GET /api/acesso/abc123')).toBe('GET /api/acesso/:token')
  })

  it('não mexe no que não tem segredo', () => {
    expect(urlSemSegredo('https://app.exemplo/inicio')).toBe('https://app.exemplo/inicio')
    expect(urlSemSegredo('/api/desbravadores/12/convite-acesso')).toBe('/api/desbravadores/12/convite-acesso')
    expect(urlSemSegredo('/api/unidades/12/substituicao')).toBe('/api/unidades/12/substituicao')
  })
})
