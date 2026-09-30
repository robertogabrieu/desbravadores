import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { caminhoDoConvite } from './mailpit'

test.use({ baseURL: process.env['E2E_WEB_URL'] })

const RAIZ_API = resolve(__dirname, '../apps/api')
const SENHA = 'senha-e2e-12345'
// Um JPEG mínimo (1x1) é o bastante: o teste confere o envio, não a imagem.
const JPEG_MINIMO = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)

async function definirSenhaDoConvite(page: Page, caminho: string): Promise<void> {
  await page.goto(caminho)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA)
  await page.getByLabel('Confirme a senha').fill(SENHA)
  await page.getByRole('button', { name: 'Definir senha' }).click()
}

test('domingo: a chamada feita sem rede chega sozinha, entra no histórico e no ranking', async ({ page, context }) => {
  const id = randomBytes(3).toString('hex')
  const admEmail = `adm-${id}@e2e.local`
  const conselheiroEmail = `conselheiro-${id}@e2e.local`
  const unidade = `Águias ${id}`
  const dbvs = [`Ana Águia ${id}`, `Bia Águia ${id}`]

  execFileSync(
    process.execPath,
    ['dist/scripts/clube-criar.js', '--nome', `Clube ${id}`, '--slug', `clube-${id}`, '--adm-nome', 'Admin E2E', '--adm-email', admEmail],
    {
      cwd: RAIZ_API,
      env: { ...process.env, DATABASE_URL: process.env['E2E_DATABASE_URL'], APP_URL: process.env['E2E_WEB_URL'] },
      stdio: 'pipe',
    },
  )

  // O Adm prepara o cenário: uma unidade com dois desbravadores e o conselheiro dela.
  await definirSenhaDoConvite(page, await caminhoDoConvite(admEmail))
  await expect(page).toHaveURL(/\/adm\/desbravadores$/)

  await page.goto('/adm/unidades')
  await page.getByRole('button', { name: 'Nova unidade' }).click()
  await page.getByRole('dialog').getByLabel('Nome', { exact: true }).fill(unidade)
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('heading', { name: unidade })).toBeVisible()

  for (const nome of dbvs) {
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

  await page.goto('/adm/usuarios')
  await page.getByRole('button', { name: 'Convidar usuário' }).click()
  const convite = page.getByRole('dialog')
  await convite.getByLabel('Nome', { exact: true }).fill('Carla Conselheira')
  await convite.getByLabel('E-mail').fill(conselheiroEmail)
  await convite.getByLabel('Papel').selectOption({ label: 'Conselheiro' })
  await convite.getByLabel(unidade).check()
  await convite.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByText(conselheiroEmail)).toBeVisible()

  await page.getByRole('button', { name: /Admin E2E/, expanded: false }).click()
  await page.getByRole('menuitem', { name: 'Sair', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)

  // Domingo: o conselheiro entra com internet e o app baixa a lista da unidade.
  await definirSenhaDoConvite(page, await caminhoDoConvite(conselheiroEmail))
  await expect(page).toHaveURL(/\/inicio$/)
  await page.waitForFunction('navigator.serviceWorker.controller !== null')
  await page.goto('/reunioes/nova')
  await expect(page.getByRole('button', { name: new RegExp(dbvs[0] ?? '') })).toBeVisible()

  // Sem rede, a chamada inteira: marca todos e salva.
  await context.setOffline(true)
  for (const nome of dbvs) {
    await page.getByRole('listitem', { name: nome }).getByRole('button', { name: new RegExp(nome) }).click()
  }
  await page.getByRole('button', { name: /Salvar chamada/ }).click()
  await expect(page).toHaveURL(/\/reunioes$/)
  await expect(page.getByRole('link', { name: '1 aguardando envio' })).toBeVisible()

  // Fecha a aba com a chamada ainda na fila e abre outra, agora com a rede de volta.
  await page.close()
  await context.setOffline(false)
  const outra = await context.newPage()
  await outra.goto('/reunioes')

  await expect(outra.getByText(/aguardando envio/)).toHaveCount(0, { timeout: 30_000 })
  await expect(outra.getByText('2/2 presentes')).toBeVisible()

  await outra.goto('/ranking')
  await expect(outra.getByText(dbvs[0] ?? '').first()).toBeVisible()
  await expect(outra.getByText(/\d+ pts/).first()).toBeVisible()
  await expect(outra.getByText('Ainda não há pontos neste mês.')).toHaveCount(0)

  // Fotos: só rodam quando a galeria da onda 3 estiver pronta (B7).
  test.skip(process.env['E2E_FOTOS'] !== '1', 'aguardando a galeria (B7)')
  await outra.goto('/galeria/enviar')
  await outra.getByLabel('Reunião de hoje').check()
  await outra.locator('input[type="file"]').setInputFiles([
    { name: 'foto-1.jpg', mimeType: 'image/jpeg', buffer: JPEG_MINIMO },
    { name: 'foto-2.jpg', mimeType: 'image/jpeg', buffer: JPEG_MINIMO },
  ])
  await outra.getByRole('button', { name: /Enviar/ }).click()
  await outra.goto('/galeria')
  await outra.getByRole('link', { name: /Reunião/ }).first().click()
  await expect(outra.getByRole('img')).toHaveCount(2)
})
