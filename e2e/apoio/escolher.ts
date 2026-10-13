import type { Locator, Page } from '@playwright/test'

/**
 * Escolhe uma opção do Selecao: abre a lista e clica na opção pelo valor (texto simples) ou pelo
 * rótulo (`{ label }`). O Playwright só entende `selectOption` em `<select>` nativo.
 */
export async function escolher(page: Page, campo: Locator, opcao: string | { label: string }): Promise<void> {
  await campo.click()
  const alvo = typeof opcao === 'string' ? page.locator(`[role="option"][data-valor="${opcao}"]`) : page.getByRole('option', { name: opcao.label, exact: true })
  await alvo.click()
}
