import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { criarAcesso, criarClube, SENHA_DE_TESTE } from './apoio/semear'

test.use({ baseURL: process.env['E2E_WEB_URL'] })

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA_DE_TESTE)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test('regras de pontuação: o Adm chega pelo Ranking, edita Presença e vê a confirmação', async ({ page }) => {
  const clube = await criarClube()
  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
  await entrar(page, adm.usuario.email)

  // Entrada pelo link do Ranking, não pela URL direta.
  await page.goto('/ranking')
  await page.getByRole('link', { name: 'Regras de pontuação' }).click()
  await expect(page).toHaveURL(/\/adm\/ranking\/regras$/)

  // Presença nasce valendo 10; o painel de edição muda para 12.
  await page.getByRole('button', { name: 'Editar Presença' }).click()
  const campo = page.getByLabel('Pontos', { exact: true })
  await expect(campo).toBeFocused()
  await campo.fill('12')
  await page.getByRole('button', { name: 'Salvar pontos' }).click()

  await expect(
    page.getByText('Presença agora vale 12 pontos. Vale a partir de agora; o que já foi lançado não mudou.'),
  ).toBeVisible()

  // A Classe Bíblica não tem mais pontos em Configurações.
  await page.goto('/adm/configuracoes')
  await expect(page.getByRole('heading', { name: 'Configurações do clube' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pontos da Classe Bíblica' })).toHaveCount(0)
})
