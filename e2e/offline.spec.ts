import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { caminhoDoConvite } from './mailpit'

test.use({ baseURL: process.env['E2E_WEB_URL'] })

const RAIZ_API = resolve(__dirname, '../apps/api')
const SENHA = 'senha-e2e-12345'

test('depois de entrar, o app reabre sem rede em modo sem conexão', async ({ page, context }) => {
  const id = randomBytes(3).toString('hex')
  const admEmail = `offline-${id}@e2e.local`

  execFileSync(
    process.execPath,
    ['dist/scripts/clube-criar.js', '--nome', `Clube ${id}`, '--slug', `clube-${id}`, '--adm-nome', 'Admin Offline', '--adm-email', admEmail],
    {
      cwd: RAIZ_API,
      env: { ...process.env, DATABASE_URL: process.env['E2E_DATABASE_URL'], APP_URL: process.env['E2E_WEB_URL'] },
      stdio: 'pipe',
    },
  )

  await page.goto(await caminhoDoConvite(admEmail))
  await page.getByLabel('Senha', { exact: true }).fill(SENHA)
  await page.getByLabel('Confirme a senha').fill(SENHA)
  await page.getByRole('button', { name: 'Definir senha' }).click()
  await expect(page).toHaveURL(/\/adm\/desbravadores$/)

  // O service worker precisa controlar a página antes de a rede sumir: é ele que serve o app.
  await page.waitForFunction('navigator.serviceWorker.controller !== null')

  await context.setOffline(true)
  await page.reload()

  // A abertura tenta a rede, espera 5 s e tenta de novo antes de assumir o modo sem conexão.
  await expect(page.getByRole('status').filter({ hasText: 'Sem conexão' })).toBeVisible({ timeout: 20_000 })
  await expect(page).not.toHaveURL(/\/(login|conectar)/)
})
