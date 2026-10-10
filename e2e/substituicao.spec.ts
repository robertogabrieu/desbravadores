import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { configurarClube, criarAcesso, criarClube, criarDbv, criarMembro, criarUnidade, prismaDeTeste, SENHA_DE_TESTE } from './apoio/semear'

test.use({ baseURL: process.env['E2E_WEB_URL'] })

const CELULAR = { width: 390, height: 844 }
const FUSO = 'America/Sao_Paulo'

/**
 * A API confere a janela do link pelo relógio dela, então a reunião é semeada em torno de agora: o dia
 * da semana de hoje e o início na hora cheia anterior (00:00 logo depois da meia-noite). A janela de
 * 3 horas contém o instante do teste.
 */
function reuniaoDeAgora(): { hoje: string; diaReuniao: number; horaReuniao: string } {
  const agora = new Date()
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(agora)
  const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', hourCycle: 'h23' }).format(agora))
  return {
    hoje,
    diaReuniao: new Date(`${hoje}T00:00:00Z`).getUTCDay(),
    horaReuniao: `${String(Math.max(hora - 1, 0)).padStart(2, '0')}:00`,
  }
}

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA_DE_TESTE)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function novoContexto(browser: Browser, viewport?: { width: number; height: number }): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: process.env['E2E_WEB_URL'], viewport })
  return contexto.newPage()
}

test('substituição: o Adm gera o link da unidade, alguém sem conta faz a chamada pelo link e o Adm vê quem abriu e o aviso na reunião', async ({
  browser,
}) => {
  const { hoje, diaReuniao, horaReuniao } = reuniaoDeAgora()
  const clube = await criarClube()
  await configurarClube({ clubeId: clube.id, fuso: FUSO, diaReuniao, horaReuniao })
  const unidade = await criarUnidade({ clubeId: clube.id, nome: 'Águias' })
  const dbvs = await Promise.all(['Bruno Lima', 'Carla Dias'].map((nome) => criarDbv({ clubeId: clube.id, nome })))
  for (const dbv of dbvs) await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-02-01' })
  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })

  // O Adm parte do cartão da ficha da unidade e gera o link para a reunião de hoje.
  const paginaAdm = await novoContexto(browser)
  await entrar(paginaAdm, adm.usuario.email)
  await paginaAdm.goto(`/adm/unidades/${unidade.id}`)
  const cartao = paginaAdm.getByRole('region', { name: 'Substituto para um dia' })
  await expect(cartao.getByText(/Se nenhum conselheiro puder vir/)).toBeVisible()
  await cartao.getByRole('link', { name: 'Gerar link de substituição' }).click()
  await expect(paginaAdm.getByRole('radiogroup', { name: 'Para qual reunião?' })).toBeVisible()
  await paginaAdm.getByRole('button', { name: /^Gerar link para / }).click()
  const mensagem = paginaAdm.getByText(/Não precisa de senha:/)
  await expect(mensagem).toContainText('Unidade Águias')
  const caminhoDoLink = /\/substituto\/\S+/.exec(await mensagem.innerText())?.[0]
  if (!caminhoDoLink) throw new Error('A mensagem do WhatsApp precisa trazer o link de substituição')

  // Outra pessoa, num celular sem login, abre o link dentro da janela, diz o nome e faz a chamada.
  const paginaSubstituto = await novoContexto(browser, CELULAR)
  await paginaSubstituto.goto(caminhoDoLink)
  await expect(paginaSubstituto.getByRole('heading', { level: 1, name: /Águias/ })).toBeVisible()
  await paginaSubstituto.getByLabel('Qual é o seu nome?').fill('Ana Souza')
  await paginaSubstituto.getByRole('button', { name: 'Começar a chamada' }).click()
  await expect(paginaSubstituto).toHaveURL(/\/substituto\/[^/]+\/chamada/)
  for (const dbv of dbvs) {
    await paginaSubstituto.getByRole('listitem', { name: dbv.nome }).getByRole('button', { name: new RegExp(dbv.nome) }).click()
  }
  await paginaSubstituto.getByRole('button', { name: /Salvar chamada/ }).click()

  // S8: a confirmação diz que a chamada já está com a unidade e com o Adm.
  await expect(paginaSubstituto).toHaveURL(/\/substituto\/[^/]+\/salvo$/)
  await expect(paginaSubstituto.getByRole('heading', { name: 'Chamada salva' })).toBeVisible()
  await expect(paginaSubstituto.getByText('Ela já aparece para os conselheiros da unidade e para o Adm, com o seu nome.')).toBeVisible()
  await expect(paginaSubstituto.getByRole('link', { name: 'Abrir a chamada de novo' })).toBeVisible()

  // O Adm volta à ficha da unidade e o cartão diz quem abriu o link.
  await paginaAdm.goto(`/adm/unidades/${unidade.id}`)
  await expect(paginaAdm.getByRole('region', { name: 'Substituto para um dia' }).getByText(/^Aberto por Ana Souza às \d{2}:\d{2}$/)).toBeVisible()

  // Na reunião de hoje, o aviso R1 diz que a chamada veio pelo link e quem a lançou.
  const reuniao = await prismaDeTeste().reuniao.findFirstOrThrow({
    where: { unidadeId: unidade.id, data: new Date(`${hoje}T00:00:00Z`) },
  })
  await paginaAdm.goto(`/adm/reunioes/${reuniao.id}`)
  const aviso = paginaAdm.locator('[data-r1="substituicao"]')
  await expect(aviso).toContainText('Substituição.')
  await expect(aviso).toContainText('Chamada lançada por Ana Souza')
  await expect(aviso).toContainText('(sem conta no app)')
  await expect(aviso).toContainText('(Adm) gerou.')
})
