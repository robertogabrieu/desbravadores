import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { criarAcesso, criarClube, criarDbv, criarMembro, criarUnidade, SENHA_DE_TESTE } from './apoio/semear'

test.use({ baseURL: process.env['E2E_WEB_URL'] })

const hojeEmSaoPaulo = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

/** `AAAA-MM-DD` deslocado `dias` (negativo para trás) a partir de `data`. */
const somarDias = (data: string, dias: number): string => new Date(Date.parse(`${data}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA_DE_TESTE)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function novaSessao(browser: Browser, email: string): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: process.env['E2E_WEB_URL'] })
  const page = await contexto.newPage()
  await entrar(page, email)
  return page
}

test('evento especial: o Adm cria, registra quem foi e conclui; conselheiro e instrutor leem o calendário e o início mostra o próximo evento', async ({ browser }) => {
  const id = randomBytes(3).toString('hex')
  const hoje = hojeEmSaoPaulo()
  const nomeDoEvento = `Culto de gala ${id}`
  const nomeDaPessoa = `Ana Evento ${id}`

  // Cenário: um desbravador numa unidade desde antes do evento; Adm, conselheiro da unidade e instrutor.
  const clube = await criarClube()
  const unidade = await criarUnidade({ clubeId: clube.id, nome: `Águias ${id}` })
  const dbv = await criarDbv({ clubeId: clube.id, nome: nomeDaPessoa })
  await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: somarDias(hoje, -60) })
  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
  const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
  const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })

  // O Adm cria o evento de hoje (a lista só abre no dia) com uniforme de gala, 20 pontos por ir e 10 pelo uniforme.
  const paginaAdm = await novaSessao(browser, adm.usuario.email)
  await paginaAdm.goto('/adm/calendario')
  await paginaAdm.getByRole('link', { name: 'Novo evento' }).click()
  await paginaAdm.getByRole('link', { name: /^Evento especial/ }).click()
  await paginaAdm.getByLabel('Nome', { exact: true }).fill(nomeDoEvento)
  await paginaAdm.getByLabel('Início').fill(hoje)
  await paginaAdm.getByLabel('Fim').fill(hoje)
  await paginaAdm.getByLabel('Pontos por ir ao evento').fill('20')
  await paginaAdm.getByRole('radio', { name: 'Uniforme de gala' }).click()
  await paginaAdm.getByLabel('Pontos por usar o uniforme').fill('10')
  await paginaAdm.getByRole('button', { name: 'Salvar', exact: true }).click()

  // A ficha do evento mostra o uniforme e os pontos, e oferece registrar quem foi.
  await expect(paginaAdm.getByRole('heading', { level: 1, name: nomeDoEvento })).toBeVisible()
  const pontosEUniforme = paginaAdm.getByRole('region', { name: 'Pontos e uniforme' })
  await expect(pontosEUniforme.getByText('Uniforme de gala')).toBeVisible()
  await expect(pontosEUniforme.getByText('20', { exact: true })).toBeVisible()
  await expect(pontosEUniforme.getByText('10', { exact: true })).toBeVisible()
  await paginaAdm.getByRole('link', { name: 'Registrar quem foi' }).click()

  // Quem foi: marca a pessoa e "de gala"; a lista se salva sozinha e a conclusão manda os 30 pontos ao ranking.
  await expect(paginaAdm.getByRole('heading', { level: 1, name: 'Quem foi' })).toBeVisible()
  const linha = paginaAdm.getByRole('row').filter({ hasText: nomeDaPessoa })
  await linha.getByRole('button', { name: `Não foi: ${nomeDaPessoa}` }).click()
  await expect(linha.getByText('Foi', { exact: true })).toBeVisible()
  await linha.getByRole('button', { name: `De gala: ${nomeDaPessoa}` }).click()
  await expect(linha.getByRole('button', { name: `De gala: ${nomeDaPessoa}` })).toHaveAttribute('aria-pressed', 'true')
  await expect(paginaAdm.getByText('1 de 1 foram')).toBeVisible()
  await expect(paginaAdm.getByText('1 de gala')).toBeVisible()
  await paginaAdm.getByRole('button', { name: 'Concluir a lista' }).click()
  await expect(paginaAdm.getByRole('heading', { name: 'Lista concluída' })).toBeVisible()

  // O ranking do mês mostra a pessoa com 20 + 10 pontos.
  await paginaAdm.goto('/ranking')
  await expect(paginaAdm.getByText(nomeDaPessoa).first()).toBeVisible()
  await expect(paginaAdm.getByText('30 pts')).toBeVisible()

  // O conselheiro abre o calendário do clube e vê o evento com o uniforme e os pontos.
  const paginaConselheiro = await novaSessao(browser, conselheiro.usuario.email)
  await paginaConselheiro.goto('/calendario')
  const eventoDoConselheiro = paginaConselheiro.getByRole('article', { name: nomeDoEvento })
  await expect(eventoDoConselheiro).toBeVisible({ timeout: 30_000 })
  await expect(eventoDoConselheiro.getByText('Uniforme de gala')).toBeVisible()
  await expect(eventoDoConselheiro.getByText('Vale pontos no ranking: 20 por ir, mais 10 pelo uniforme de gala.')).toBeVisible()

  // O início do conselheiro mostra o cartão "Próximo evento".
  await paginaConselheiro.goto('/')
  const cartaoDoConselheiro = paginaConselheiro.getByRole('region', { name: 'Próximo evento' })
  await expect(cartaoDoConselheiro).toBeVisible({ timeout: 30_000 })
  await expect(cartaoDoConselheiro.getByText(nomeDoEvento)).toBeVisible()
  await expect(cartaoDoConselheiro.getByText('Uniforme de gala')).toBeVisible()

  // O instrutor vê o mesmo evento no calendário e o cartão no início.
  const paginaInstrutor = await novaSessao(browser, instrutor.usuario.email)
  await paginaInstrutor.goto('/calendario')
  const eventoDoInstrutor = paginaInstrutor.getByRole('article', { name: nomeDoEvento })
  await expect(eventoDoInstrutor).toBeVisible({ timeout: 30_000 })
  await expect(eventoDoInstrutor.getByText('Uniforme de gala')).toBeVisible()
  await expect(eventoDoInstrutor.getByText('Vale pontos no ranking: 20 por ir, mais 10 pelo uniforme de gala.')).toBeVisible()
  await paginaInstrutor.goto('/')
  const cartaoDoInstrutor = paginaInstrutor.getByRole('region', { name: 'Próximo evento' })
  await expect(cartaoDoInstrutor).toBeVisible({ timeout: 30_000 })
  await expect(cartaoDoInstrutor.getByText(nomeDoEvento)).toBeVisible()
})
