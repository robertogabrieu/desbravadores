import { carregarAmbienteTeste, variavelObrigatoria } from '../apps/api/test/ambiente'
import { apagarBanco } from '../apps/api/test/banco'
import { derrubarProcessos } from './processos'

export default async function globalTeardown(): Promise<void> {
  derrubarProcessos(process.env['E2E_PIDS'])
  const banco = process.env['E2E_BANCO_NOME']
  if (!banco) return
  carregarAmbienteTeste()
  await apagarBanco(variavelObrigatoria('DATABASE_URL_ADMIN'), banco)
}
