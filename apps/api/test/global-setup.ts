import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { carregarAmbienteTeste, variavelObrigatoria } from './ambiente'
import { apagarBanco, criarBancoTemporario } from './banco'

const RAIZ_API = resolve(__dirname, '..')

export default async function globalSetup(): Promise<void> {
  carregarAmbienteTeste()
  const urlAdmin = variavelObrigatoria('DATABASE_URL_ADMIN')
  const banco = await criarBancoTemporario(urlAdmin, variavelObrigatoria('DATABASE_URL'))

  try {
    // A carga oficial roda uma vez por execucao, num processo filho (o mesmo `tsx` do `npm run carga`).
    execFileSync(process.execPath, ['-r', 'tsx/cjs', 'src/scripts/carga.ts'], {
      cwd: RAIZ_API,
      env: { ...process.env, DATABASE_URL: banco.url },
      stdio: 'pipe',
    })
  } catch (erro) {
    await apagarBanco(urlAdmin, banco.nome)
    throw erro
  }

  process.env['DATABASE_URL'] = banco.url
  process.env['TESTE_BANCO_NOME'] = banco.nome
}
