import { PrismaPg } from '@prisma/adapter-pg'
import { Client } from 'pg'
import { PrismaClient } from '../src/generated/prisma/client.js'

describe('banco de teste por execucao', () => {
  it('a API enxerga o banco temporario da execucao, como usuario desbravador', async () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
    })
    try {
      const um = await prisma.$queryRaw<{ um: number }[]>`SELECT 1 AS um`
      expect(um[0]?.um).toBe(1)

      const info = await prisma.$queryRaw<{ banco: string; usuario: string }[]>`
        SELECT current_database() AS banco, current_user AS usuario`
      expect(info[0]?.banco).toMatch(/^teste_\d+_[0-9a-f]{8}$/)
      expect(info[0]?.banco).toBe(process.env['TESTE_BANCO_NOME'])
      expect(info[0]?.usuario).toBe('desbravador')
    } finally {
      await prisma.$disconnect()
    }
  })

  it('o teardown tem como apagar: o banco existe agora na lista do servidor', async () => {
    const admin = new Client({ connectionString: process.env['DATABASE_URL_ADMIN'] })
    await admin.connect()
    try {
      const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
        process.env['TESTE_BANCO_NOME'],
      ])
      expect(rows).toHaveLength(1)
    } finally {
      await admin.end()
    }
  })
})
