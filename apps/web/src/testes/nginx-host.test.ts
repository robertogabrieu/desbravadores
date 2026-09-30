import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Modelo do site no Nginx do servidor, preenchido por scripts/instalar.sh --nginx.
const conteudo = readFileSync(resolve(__dirname, '../../../../scripts/nginx-host.conf'), 'utf8')
const formatoDeLog = readFileSync(resolve(__dirname, '../../../../scripts/nginx-host-log.conf'), 'utf8')
const semComentarios = conteudo
  .split('\n')
  .filter((linha) => !linha.trim().startsWith('#'))
  .join('\n')

describe('nginx-host.conf: site no Nginx do servidor', () => {
  it('tem os dois marcadores que o instalador troca', () => {
    expect(conteudo).toContain('server_name __DOMINIO__;')
    expect(conteudo).toContain('proxy_pass http://127.0.0.1:__PORTA__;')
  })

  it('aceita os materiais de até 20 MB', () => {
    expect(conteudo).toMatch(/client_max_body_size 21m;/)
  })

  it('repassa o IP e o protocolo que a API usa (TRUST_PROXY=2 e cookie Secure)', () => {
    expect(conteudo).toContain('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;')
    expect(conteudo).toContain('proxy_set_header X-Forwarded-Proto $scheme;')
  })

  it('grava o log de acesso sem a query, onde vai a assinatura dos links de arquivo', () => {
    const formato = /log_format desbravadores_sem_query([^;]*);/.exec(formatoDeLog)?.[1] ?? ''
    expect(formato).toContain('$uri')
    expect(formato).not.toMatch(/\$(request|request_uri|args|query_string)\b(?!_)/)
    expect(conteudo).toMatch(/access_log \S+ desbravadores_sem_query;/)
  })

  it('não define o formato de log no site (um segundo domínio repetiria o nome)', () => {
    expect(semComentarios).not.toContain('log_format')
  })

  it('escuta só na porta 80 (o certbot acrescenta o 443)', () => {
    expect(semComentarios).not.toMatch(/listen[^;]*443/)
  })
})
