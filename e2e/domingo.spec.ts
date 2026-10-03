import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
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
  await page.getByRole('link', { name: 'Nova unidade' }).click()
  await page.getByLabel('Nome', { exact: true }).fill(unidade)
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('heading', { level: 1, name: unidade })).toBeVisible()

  for (const nome of dbvs) {
    await page.goto('/adm/desbravadores')
    await page.getByRole('link', { name: 'Novo desbravador' }).click()
    await page.getByLabel('Nome completo').fill(nome)
    await page.getByLabel('Nascimento').fill('2014-03-10')
    await page.getByLabel('Sexo').selectOption('F')
    await page.getByLabel('Entrada no clube').fill('2026-02-01')
    await page.getByLabel('Unidade').selectOption({ label: unidade })
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible()
  }

  await page.goto('/adm/usuarios')
  await page.getByRole('link', { name: 'Convidar usuário' }).click()
  await page.getByLabel('Nome', { exact: true }).fill('Carla Conselheira')
  await page.getByLabel('E-mail').fill(conselheiroEmail)
  await page.getByRole('radio', { name: /Conselheiro/ }).check()
  await page.getByRole('button', { name: unidade, exact: true }).click()
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Carla Conselheira' })).toBeVisible()

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
  await expect(page.getByText('não enviado')).toBeVisible()
  await expect(page.getByRole('link', { name: '1 aguardando envio' })).toBeVisible()

  // Fecha a aba com a chamada ainda na fila e abre outra, agora com a rede de volta.
  await page.close()
  await context.setOffline(false)
  const outra = await context.newPage()
  await outra.goto('/reunioes')

  await expect(outra.getByText(/aguardando envio/)).toHaveCount(0, { timeout: 30_000 })
  await expect(outra.getByText('2/2 presentes')).toBeVisible()
  await expect(outra.getByText('não enviado')).toHaveCount(0)

  await outra.goto('/ranking')
  await expect(outra.getByText(dbvs[0] ?? '').first()).toBeVisible()
  // Presente sem chips nos critérios padrão: Presença (10) + Pontualidade (5) = 15 pontos cada.
  for (const nome of dbvs) {
    await expect(outra.getByRole('listitem').filter({ hasText: nome }).getByText('15 pts')).toBeVisible()
  }
  await expect(outra.getByText('Ainda não há pontos neste mês.')).toHaveCount(0)

  // Fotos: duas imagens geradas na própria página vão para o álbum da reunião de hoje.
  const imagem = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#22aa77' } }).jpeg().toBuffer()
  await outra.goto('/galeria/enviar')
  await outra.getByRole('radio', { name: /Reunião de hoje/ }).click()
  await outra.getByLabel('Fotos da galeria').setInputFiles([
    { name: 'foto-1.jpg', mimeType: 'image/jpeg', buffer: imagem },
    { name: 'foto-2.jpg', mimeType: 'image/jpeg', buffer: imagem },
  ])
  await outra.getByRole('button', { name: 'Enviar 2 fotos' }).click()
  await expect(outra.getByText('2 fotos enviadas')).toBeVisible({ timeout: 30_000 })
  await outra.getByRole('link', { name: 'Ver álbum' }).click()
  await expect(outra.getByRole('img', { name: /^Foto \d+$/ })).toHaveCount(2)
})
