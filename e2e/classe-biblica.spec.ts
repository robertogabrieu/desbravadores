import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { criarAcesso, criarClube, criarDbv, criarMembro, criarUnidade, SENHA_DE_TESTE } from './apoio/semear'

test.use({ baseURL: process.env['E2E_WEB_URL'] })

const hojeEmSaoPaulo = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

/** `AAAA-MM-DD` deslocado `dias` (negativo para trás) a partir de `data`. */
const somarDias = (data: string, dias: number): string => new Date(Date.parse(`${data}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)

const diaMes = (data: string): string => `${data.slice(8, 10)}/${data.slice(5, 7)}`

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA_DE_TESTE)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test('classe bíblica: o Adm cria a edição, faz a chamada sem rede e ela chega ao painel e ao ranking', async ({ page, context }) => {
  const id = randomBytes(3).toString('hex')
  const hoje = hojeEmSaoPaulo()
  const diaDaSemana = new Date(`${hoje}T12:00:00Z`).getUTCDay()
  const nomeDaEdicao = `Classe Bíblica ${id}`
  const aguias = `Águias ${id}`
  const gavioes = `Gaviões ${id}`
  const [ana, bia, caio] = [`Ana Águia ${id}`, `Bia Águia ${id}`, `Caio Águia ${id}`]

  // Cenário: duas unidades, três desbravadores nas Águias e um nos Gaviões, todos na unidade desde antes da edição.
  const clube = await criarClube()
  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
  const unidadeAguias = await criarUnidade({ clubeId: clube.id, nome: aguias })
  const unidadeGavioes = await criarUnidade({ clubeId: clube.id, nome: gavioes })
  for (const nome of [ana, bia, caio]) {
    const dbv = await criarDbv({ clubeId: clube.id, nome })
    await criarMembro({ dbvId: dbv.id, unidadeId: unidadeAguias.id, inicio: somarDias(hoje, -60) })
  }
  const dbvGavioes = await criarDbv({ clubeId: clube.id, nome: `Duda Gavião ${id}` })
  await criarMembro({ dbvId: dbvGavioes.id, unidadeId: unidadeGavioes.id, inicio: somarDias(hoje, -60) })

  await entrar(page, adm.usuario.email)

  // Etapa 1: a edição começa uma semana atrás no dia da semana de hoje, para que o encontro de hoje aceite chamada.
  await page.goto('/adm/classe-biblica')
  await page.getByRole('link', { name: 'Criar a primeira edição' }).click()
  await page.getByLabel('Nome da edição').fill(nomeDaEdicao)
  await page.getByLabel('Nome da edição').blur()
  await expect(page.getByText(/^Salvo às/)).toBeVisible()
  await page.getByLabel('Início', { exact: true }).fill(somarDias(hoje, -7))
  await page.getByLabel('Fim', { exact: true }).fill(somarDias(hoje, 7))
  await page.getByLabel('Dia da semana').selectOption(String(diaDaSemana))
  await page.getByLabel('Horário').fill('14:00')
  await page.getByLabel('Local').fill('Salão da igreja')
  await page.getByRole('button', { name: 'Continuar para os grupos' }).click()

  // Etapa 2: o Grupo Daniel (Águias) leva um link de material; o Grupo Ester (Gaviões) fica sem material.
  await expect(page.getByRole('heading', { level: 1, name: 'Grupos' })).toBeVisible()
  await expect(page).toHaveURL(/\/adm\/classe-biblica\/[^/]+\/etapa\/2$/)
  const primeiro = page.getByRole('region', { name: 'Grupo 1', exact: true })
  await primeiro.getByLabel('Nome do grupo').fill('Grupo Daniel')
  await primeiro.getByLabel('Nome do grupo').blur()
  await primeiro.getByRole('checkbox', { name: new RegExp(`^${aguias}`) }).check()
  await primeiro.getByRole('button', { name: 'Colar um link' }).click()
  await primeiro.getByLabel('Nome do material').fill('Lições do trimestre')
  await primeiro.getByLabel('Link', { exact: true }).fill('https://www.exemplo.org/licoes')
  await primeiro.getByRole('button', { name: 'Anexar o link' }).click()
  await expect(primeiro.getByText('Link anexado')).toBeVisible()

  await page.getByRole('button', { name: 'Adicionar outro grupo' }).click()
  const segundo = page.getByRole('region', { name: 'Grupo 2', exact: true })
  await segundo.getByLabel('Nome do grupo').fill('Grupo Ester')
  await segundo.getByLabel('Nome do grupo').blur()
  await expect(segundo.getByRole('checkbox', { name: new RegExp(`^${aguias} · no Grupo Daniel`) })).toBeDisabled()
  await segundo.getByRole('checkbox', { name: new RegExp(`^${gavioes}`) }).check()
  await expect(page.getByText('2 de 2 unidades estão em um grupo.')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar para as datas' }).click()

  // Etapa 3: as três datas da edição vêm marcadas (o clube não tem férias nem feriados cadastrados).
  await expect(page.getByRole('heading', { level: 1, name: 'Datas dos encontros' })).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(3)
  await expect(page.getByRole('checkbox', { name: new RegExp(diaMes(hoje)) })).toBeChecked()
  await expect(page.getByText('3 encontros vão para o calendário do clube, para os dois grupos.')).toBeVisible()
  await page.getByRole('button', { name: 'Criar 3 encontros' }).click()

  await expect(page.getByRole('heading', { level: 1, name: `${nomeDaEdicao} criada` })).toBeVisible()
  await expect(page.getByText(`Grupo Daniel: ${aguias} · material enviado`)).toBeVisible()
  await expect(page.getByText(`Grupo Ester: ${gavioes} · ainda sem material`)).toBeVisible()
  await page.getByRole('link', { name: 'Ver a edição' }).click()
  await expect(page).toHaveURL(/\/adm\/classe-biblica\/[^/]+$/)
  const caminhoDoPainel = new URL(page.url()).pathname

  // Os encontros estão no calendário do clube, com o nome da edição e o tipo Classe Bíblica.
  await page.goto(`/adm/calendario?mes=${hoje.slice(0, 7)}`)
  const doMes = page.getByRole('list', { name: /^Eventos de / }).getByRole('listitem').filter({ hasText: nomeDaEdicao })
  await expect(doMes.first()).toBeVisible()
  await expect(doMes.first()).toContainText('Classe Bíblica')

  // A chamada abre com internet; o service worker precisa controlar a página antes de a rede sumir.
  await page.goto(caminhoDoPainel)
  await page.waitForFunction('navigator.serviceWorker.controller !== null')
  await page.getByRole('tab', { name: 'Grupo Daniel' }).click()
  await page.getByRole('link', { name: 'Fazer a chamada do Grupo Daniel' }).click()
  await expect(page.getByRole('listitem', { name: ana })).toBeVisible()

  // Sem rede: Caio faltou, Ana participou ativamente, Bia fica só presente.
  await context.setOffline(true)
  await expect(page.getByText('Sem conexão. A chamada fica guardada no aparelho e é enviada quando a internet voltar.')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('listitem', { name: caio }).getByRole('button', { name: new RegExp(caio) }).click()
  await expect(page.getByRole('listitem', { name: caio }).getByText('Faltou')).toBeVisible()
  await page.getByRole('listitem', { name: ana }).getByRole('button', { name: 'Participou ativamente' }).click()
  await expect(page.getByRole('listitem', { name: ana }).getByRole('button', { name: 'Participou ativamente' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Salvar chamada' }).click()
  await expect(page.getByRole('heading', { name: 'Chamada guardada no aparelho' })).toBeVisible()

  // Fecha a aba com a chamada na fila e abre outra, agora com a rede de volta: a fila envia sozinha.
  await page.close()
  await context.setOffline(false)
  const outra = await context.newPage()
  await outra.goto(caminhoDoPainel)
  await expect(outra.getByText(/aguardando envio/)).toHaveCount(0, { timeout: 30_000 })

  // O painel mostra o encontro de hoje como feito, com os totais da chamada.
  await outra.reload()
  await outra.getByRole('tab', { name: 'Grupo Daniel' }).click()
  await expect(outra.getByText('2 de 3 presentes · 1 participaram ativamente')).toBeVisible()
  await expect(outra.getByRole('link', { name: `Ver a chamada de ${diaMes(hoje)}` })).toBeVisible()
  await expect(outra.getByText(/de presença média em 1 encontro feito/)).toBeVisible()

  // Ranking do mês: presença na Classe Bíblica vale 10, participação ativa mais 5; quem faltou não pontua.
  await outra.goto('/ranking')
  await expect(outra.getByRole('listitem').filter({ hasText: ana }).getByText('15 pts')).toBeVisible()
  await expect(outra.getByRole('listitem').filter({ hasText: bia }).getByText('10 pts')).toBeVisible()
  await expect(outra.getByRole('listitem').filter({ hasText: caio }).getByText('0 pts', { exact: true })).toBeVisible()
})
