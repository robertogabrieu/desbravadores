import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { caminhoDoConvite } from './mailpit'

test.use({ baseURL: process.env['E2E_WEB_URL'] })

const RAIZ_API = resolve(__dirname, '../apps/api')
const SENHA = 'senha-e2e-12345'

async function definirSenhaDoConvite(page: Page, caminho: string): Promise<void> {
  await page.goto(caminho)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA)
  await page.getByLabel('Confirme a senha').fill(SENHA)
  await page.getByRole('button', { name: 'Definir senha' }).click()
}

// As telas do Adm seguem a SPEC 8.3; os rótulos usados aqui são os da interface.
async function criarUnidade(page: Page, nome: string): Promise<void> {
  await page.goto('/adm/unidades')
  await page.getByRole('button', { name: 'Nova unidade' }).click()
  const painel = page.getByRole('dialog')
  await painel.getByLabel('Nome', { exact: true }).fill(nome)
  await painel.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('heading', { name: nome })).toBeVisible()
}

async function criarDesbravador(page: Page, nome: string, unidade: string): Promise<void> {
  await page.goto('/adm/desbravadores')
  await page.getByRole('button', { name: 'Novo desbravador' }).click()
  const painel = page.getByRole('dialog')
  await painel.getByLabel('Nome completo').fill(nome)
  await painel.getByLabel('Nascimento').fill('2014-03-10')
  await painel.getByLabel('Sexo').selectOption('F')
  await painel.getByLabel('Entrada no clube').fill('2026-02-01')
  await painel.getByLabel('Unidade').selectOption({ label: unidade })
  await painel.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText(nome).first()).toBeVisible()
}

async function convidarConselheiro(page: Page, nome: string, email: string, unidade: string): Promise<void> {
  await page.goto('/adm/usuarios')
  await page.getByRole('button', { name: 'Convidar usuário' }).click()
  const painel = page.getByRole('dialog')
  await painel.getByLabel('Nome', { exact: true }).fill(nome)
  await painel.getByLabel('E-mail').fill(email)
  await painel.getByLabel('Papel').selectOption({ label: 'Conselheiro' })
  await painel.getByLabel(unidade).check()
  await painel.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText(email)).toBeVisible()
}

test('a instalação PWA existe: manifesto e service worker registrados', async ({ page }) => {
  await page.goto('/login')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).not.toBeNull()
  const resposta = await page.request.get(href ?? '')
  expect(await resposta.json()).toMatchObject({ name: 'Desbravador', display: 'standalone' })

  const escopo = await page.evaluate<string>('navigator.serviceWorker.ready.then((registro) => registro.scope)')
  expect(escopo).toBe(`${process.env['E2E_WEB_URL']}/`)
})

test('do clube:criar até o conselheiro ver só a própria unidade', async ({ page }) => {
  const id = randomBytes(3).toString('hex')
  const admEmail = `adm-${id}@e2e.local`
  const conselheiroEmail = `conselheiro-${id}@e2e.local`
  const unidadeA = `Águias ${id}`
  const unidadeB = `Falcões ${id}`
  const dbvA = `Ana da Águias ${id}`
  const dbvB = `Beto dos Falcões ${id}`

  execFileSync(
    process.execPath,
    ['dist/scripts/clube-criar.js', '--nome', `Clube ${id}`, '--slug', `clube-${id}`, '--adm-nome', 'Admin E2E', '--adm-email', admEmail],
    {
      cwd: RAIZ_API,
      env: { ...process.env, DATABASE_URL: process.env['E2E_DATABASE_URL'], APP_URL: process.env['E2E_WEB_URL'] },
      stdio: 'pipe',
    },
  )

  await definirSenhaDoConvite(page, await caminhoDoConvite(admEmail))
  await expect(page).toHaveURL(/\/adm\/desbravadores$/)

  await criarUnidade(page, unidadeA)
  await criarUnidade(page, unidadeB)
  await criarDesbravador(page, dbvA, unidadeA)
  await criarDesbravador(page, dbvB, unidadeB)
  await convidarConselheiro(page, 'Carla Conselheira', conselheiroEmail, unidadeA)

  await page.getByRole('button', { name: /Admin E2E/, expanded: false }).click()
  await page.getByRole('menuitem', { name: 'Sair', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)

  await definirSenhaDoConvite(page, await caminhoDoConvite(conselheiroEmail))
  await expect(page).toHaveURL(/\/inicio$/)
  await page.getByRole('main').getByRole('link', { name: 'Unidade', exact: true }).click()

  await expect(page.getByText(dbvA)).toBeVisible()
  await expect(page.getByText(dbvB)).toHaveCount(0)
  await expect(page.getByText(unidadeB)).toHaveCount(0)
})
