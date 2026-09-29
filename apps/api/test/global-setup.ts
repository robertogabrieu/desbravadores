import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { Client } from 'pg'
import { carregarAmbienteTeste, urlDoBanco, variavelObrigatoria } from './ambiente'

const RAIZ_API = resolve(__dirname, '..')

async function criarBanco(urlAdmin: string, banco: string, dono: string): Promise<void> {
  const admin = new Client({ connectionString: urlAdmin })
  await admin.connect()
  try {
    await admin.query(`CREATE DATABASE "${banco}" OWNER "${dono}"`)
  } finally {
    await admin.end()
  }
}

async function apagarBanco(urlAdmin: string, banco: string): Promise<void> {
  const admin = new Client({ connectionString: urlAdmin })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${banco}" WITH (FORCE)`)
  } finally {
    await admin.end()
  }
}

export default async function globalSetup(): Promise<void> {
  carregarAmbienteTeste()
  const urlAdmin = variavelObrigatoria('DATABASE_URL_ADMIN')
  const urlBase = variavelObrigatoria('DATABASE_URL')
  const banco = `teste_${process.pid}_${randomBytes(4).toString('hex')}`
  const urlTeste = urlDoBanco(urlBase, banco)

  await criarBanco(urlAdmin, banco, decodeURIComponent(new URL(urlBase).username))
  try {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: RAIZ_API,
      env: { ...process.env, DATABASE_URL: urlTeste },
      stdio: 'pipe',
    })
  } catch (erro) {
    await apagarBanco(urlAdmin, banco)
    throw erro
  }

  process.env['DATABASE_URL'] = urlTeste
  process.env['TESTE_BANCO_NOME'] = banco
}
