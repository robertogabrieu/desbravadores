import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const conteudo = readFileSync(resolve(__dirname, '../../nginx.conf'), 'utf8')

// Cada bloco `location <modificador?> <padrão> {` com o corpo até a chave que fecha (sem blocos aninhados).
const blocos = [...conteudo.matchAll(/^\s*location\s+(~\*?\s+|=\s+|\^~\s+)?(\S+)\s*\{([^}]*)\}/gm)].map((m) => ({
  modificador: (m[1] ?? '').trim(),
  padrao: m[2] ?? '',
  corpo: m[3] ?? '',
}))

describe('nginx.conf: /api sem redirecionamento', () => {
  it('nenhum prefixo simples terminado em barra sob /api/ faz proxy_pass, exceto o genérico /api/', () => {
    // Prefixo com barra final + proxy_pass faz o nginx responder 301 para o endereço sem a barra,
    // em http:// (o container não sabe que está atrás de HTTPS) — o navegador recusa seguir.
    const suspeitos = blocos
      .filter((b) => b.modificador === '' && b.padrao.startsWith('/api/') && b.padrao.endsWith('/'))
      .filter((b) => b.corpo.includes('proxy_pass'))
      .map((b) => b.padrao)
    expect(suspeitos).toEqual(['/api/'])
  })

  it('o bloco da biblioteca é regex e casa com e sem barra final', () => {
    const bloco = blocos.find((b) => b.padrao.includes('/api/biblioteca'))
    expect(bloco?.modificador).toBe('~')
    const regex = new RegExp(bloco?.padrao ?? '$^')
    expect(regex.test('/api/biblioteca')).toBe(true)
    expect(regex.test('/api/biblioteca/')).toBe(true)
    expect(regex.test('/api/biblioteca/itens/abc/arquivo')).toBe(true)
    expect(regex.test('/api/bibliotecaX')).toBe(false)
    expect(bloco?.corpo).toContain('client_max_body_size 51m')
  })
})
