import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { apagarBancosAntigos } from './limpar-bancos-teste'

// Cada teste usa um prefixo proprio, para nunca apagar o banco de outra execucao em andamento.
describe('apagarBancosAntigos', () => {
  const urlAdmin = process.env['DATABASE_URL_ADMIN'] ?? ''
  const prefixo = `teste_limpar_${randomBytes(4).toString('hex')}_`
  const banco = `${prefixo}a`

  async function comAdmin<T>(acao: (admin: Client) => Promise<T>): Promise<T> {
    const admin = new Client({ connectionString: urlAdmin })
    await admin.connect()
    try {
      return await acao(admin)
    } finally {
      await admin.end()
    }
  }

  async function existe(): Promise<boolean> {
    return comAdmin(async (admin) => {
      const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [banco])
      return rows.length === 1
    })
  }

  beforeEach(async () => {
    await comAdmin((admin) => admin.query(`CREATE DATABASE "${banco}"`))
  })

  afterEach(async () => {
    await comAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS "${banco}" WITH (FORCE)`))
  })

  it('mantem banco criado ha menos do que o limite de horas', async () => {
    const apagados = await apagarBancosAntigos(urlAdmin, 2, prefixo)
    expect(apagados).toEqual([])
    expect(await existe()).toBe(true)
  })

  it('apaga banco mais antigo do que o limite de horas', async () => {
    const apagados = await apagarBancosAntigos(urlAdmin, 0, prefixo)
    expect(apagados).toEqual([banco])
    expect(await existe()).toBe(false)
  })
})
