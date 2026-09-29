import { rmSync } from 'node:fs'
import { Client } from 'pg'

export default async function globalTeardown(): Promise<void> {
  const diretorio = process.env['TESTE_ARQUIVOS_DIR']
  if (diretorio) rmSync(diretorio, { recursive: true, force: true })

  const banco = process.env['TESTE_BANCO_NOME']
  const urlAdmin = process.env['DATABASE_URL_ADMIN']
  if (!banco || !urlAdmin) return

  const admin = new Client({ connectionString: urlAdmin })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${banco}" WITH (FORCE)`)
  } finally {
    await admin.end()
  }
}
