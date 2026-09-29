import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { Client } from 'pg'
import { urlDoBanco } from './ambiente'

const RAIZ_API = resolve(__dirname, '..')

export interface BancoTemporario {
  nome: string
  url: string
}

export async function apagarBanco(urlAdmin: string, banco: string): Promise<void> {
  const admin = new Client({ connectionString: urlAdmin })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${banco}" WITH (FORCE)`)
  } finally {
    await admin.end()
  }
}

/** Cria `teste_<pid>_<8 hex>` como usuario desbravador e roda `prisma migrate deploy` nele. */
export async function criarBancoTemporario(urlAdmin: string, urlBase: string): Promise<BancoTemporario> {
  const nome = `teste_${process.pid}_${randomBytes(4).toString('hex')}`
  const url = urlDoBanco(urlBase, nome)
  const admin = new Client({ connectionString: urlAdmin })
  await admin.connect()
  try {
    await admin.query(`CREATE DATABASE "${nome}" OWNER "${decodeURIComponent(new URL(urlBase).username)}"`)
  } finally {
    await admin.end()
  }
  try {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: RAIZ_API,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    })
  } catch (erro) {
    await apagarBanco(urlAdmin, nome)
    throw erro
  }
  return { nome, url }
}
