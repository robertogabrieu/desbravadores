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

  it.each([0, 1, 2, 3])('o bloco %i libera o envio de erros ao Sentry em connect-src', (indice) => {
    const connectSrc = /connect-src([^;]*);/.exec(politicas[indice] ?? '')
    expect(connectSrc?.[1]).toContain('https://o4512184671272960.ingest.us.sentry.io')
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

  it('o bloco de documentos de material aceita 21 MB, encaminha para a API e não tem CSP própria', () => {
    const bloco = conteudo.split('location').find((trecho) => trecho.includes('/api/materiais/arquivo')) ?? ''
    expect(bloco).toMatch(/client_max_body_size\s+21m;/)
    expect(bloco).toMatch(/set \$api http:\/\/api:3001;/)
    expect(bloco).toMatch(/proxy_pass \$api;/)
    expect(bloco).toContain('X-Forwarded-Proto')
    expect(bloco).not.toContain('Content-Security-Policy')
  })
})
