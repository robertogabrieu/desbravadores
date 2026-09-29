import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const conteudo = readFileSync(resolve(__dirname, '../../nginx.conf'), 'utf8')
const politicas = conteudo.split('\n').filter((linha) => linha.includes('Content-Security-Policy'))

describe('nginx.conf: política de segurança de conteúdo', () => {
  it('repete a política nos quatro blocos', () => {
    expect(politicas).toHaveLength(4)
  })

  it.each([0, 1, 2, 3])('o bloco %i libera blob: em img-src (miniatura de foto local)', (indice) => {
    const imgSrc = /img-src([^;]*);/.exec(politicas[indice] ?? '')
    expect(imgSrc?.[1]).toContain('blob:')
  })

  it('o bloco do service worker libera as fontes do Google em connect-src', () => {
    const blocoSw = conteudo.split('location').find((trecho) => trecho.includes('sw\\.js')) ?? ''
    const connectSrc = /connect-src([^;]*);/.exec(blocoSw)?.[1] ?? ''
    expect(connectSrc).toContain('https://fonts.googleapis.com')
    expect(connectSrc).toContain('https://fonts.gstatic.com')
  })

  it('aceita corpo de até 3 MB e não grava a query de /api/arquivos/ no log', () => {
    expect(conteudo).toMatch(/client_max_body_size\s+3m;/)
    expect(conteudo).toMatch(/log_format/)
    expect(conteudo).toMatch(/\$uri/)
  })
})
