import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import dotenv from 'dotenv'

const RAIZ = resolve(__dirname, '../../..')
const ENV_EXEMPLO = resolve(RAIZ, '.env.exemplo')
const ENV_TESTE = resolve(RAIZ, '.env.teste')

export function carregarAmbienteTeste(): void {
  if (!existsSync(ENV_TESTE)) {
    const segredo = randomBytes(32).toString('hex')
    const conteudo = readFileSync(ENV_EXEMPLO, 'utf8').replace(
      /^JWT_SEGREDO=.*$/m,
      `JWT_SEGREDO=${segredo}`,
    )
    writeFileSync(ENV_TESTE, conteudo)
  }
  dotenv.config({ path: ENV_TESTE, quiet: true })
}

export function variavelObrigatoria(nome: string): string {
  const valor = process.env[nome]
  if (!valor) throw new Error(`Variavel ${nome} ausente em .env.teste`)
  return valor
}

export function urlDoBanco(urlBase: string, banco: string): string {
  const url = new URL(urlBase)
  url.pathname = `/${banco}`
  return url.toString()
}
