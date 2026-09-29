import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { carregarAmbienteTeste, variavelObrigatoria } from '../apps/api/test/ambiente'
import { apagarBanco, criarBancoTemporario } from '../apps/api/test/banco'
import { esperarResposta, portaLivre } from './ambiente-e2e'
import { derrubarProcessos } from './processos'

const RAIZ = resolve(__dirname, '..')
const RAIZ_API = resolve(RAIZ, 'apps/api')
const RAIZ_WEB = resolve(RAIZ, 'apps/web')

export default async function globalSetup(): Promise<void> {
  carregarAmbienteTeste()
  const urlAdmin = variavelObrigatoria('DATABASE_URL_ADMIN')
  const banco = await criarBancoTemporario(urlAdmin, variavelObrigatoria('DATABASE_URL'))
  process.env['E2E_BANCO_NOME'] = banco.nome
  // Pasta própria dos arquivos enviados; o teardown a apaga.
  const arquivosDir = mkdtempSync(join(tmpdir(), 'arquivos-e2e-'))
  process.env['E2E_ARQUIVOS_DIR'] = arquivosDir

  try {
    // Mesma carga oficial do Jest: processo filho com o `tsx` do `npm run carga`.
    execFileSync(process.execPath, ['-r', 'tsx/cjs', 'src/scripts/carga.ts'], {
      cwd: RAIZ_API,
      env: { ...process.env, DATABASE_URL: banco.url },
      stdio: 'pipe',
    })
    // O service worker so existe no build, e a API sobe do dist. E2E_PULAR_BUILD=1 reaproveita os dist atuais.
    if (process.env['E2E_PULAR_BUILD'] !== '1') {
      execFileSync('npm', ['run', 'build'], { cwd: RAIZ, stdio: 'pipe' })
    }

    const portaApi = await portaLivre()
    const portaWeb = await portaLivre()
    const urlWeb = `http://localhost:${portaWeb}`
    const ambienteApi = {
      ...process.env,
      DATABASE_URL: banco.url,
      ARQUIVOS_DIR: arquivosDir,
      PORTA_API: String(portaApi),
      APP_URL: urlWeb,
      COOKIE_SECURE: 'false',
      TRUST_PROXY: '0',
    }

    const api = spawn(process.execPath, ['dist/main.js'], { cwd: RAIZ_API, env: ambienteApi, stdio: 'ignore', detached: true })
    const web = spawn('npx', ['vite', 'preview', '--host', 'localhost', '--port', String(portaWeb), '--strictPort'], {
      cwd: RAIZ_WEB,
      env: ambienteApi,
      stdio: 'ignore',
      detached: true,
    })
    process.env['E2E_PIDS'] = [api.pid, web.pid].join(',')

    await esperarResposta(`http://localhost:${portaApi}/api/saude`)
    await esperarResposta(urlWeb)

    process.env['E2E_WEB_URL'] = urlWeb
    process.env['E2E_API_URL'] = `http://localhost:${portaApi}`
    process.env['E2E_DATABASE_URL'] = banco.url
  } catch (erro) {
    derrubarProcessos(process.env['E2E_PIDS'])
    rmSync(arquivosDir, { recursive: true, force: true })
    await apagarBanco(urlAdmin, banco.nome)
    throw erro
  }
}
