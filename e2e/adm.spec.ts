import { expect, request, test } from '@playwright/test'
import type { APIRequestContext, Browser, Page } from '@playwright/test'
import {
  admDefinirClasseClube,
  anoCorrente,
  classeOficial,
  criarAcesso,
  criarClube,
  criarCronograma,
  prismaDeTeste,
  SENHA_DE_TESTE,
} from './apoio/semear'

test.use({ baseURL: process.env['E2E_WEB_URL'] })

interface LeituraDoCronograma {
  cronogramaId: string | null
  status: string | null
  aulas: { data: string; situacao: string; requisitos: { id: string }[] }[]
}

const CELULAR = { width: 390, height: 844 }

const somarDias = (data: string, dias: number): string => {
  const instante = new Date(`${data}T00:00:00Z`)
  instante.setUTCDate(instante.getUTCDate() + dias)
  return instante.toISOString().slice(0, 10)
}

/**
 * Dois domingos seguidos dentro do período semeado (o ano do clube de hoje vai até 31/12): o primeiro
 * domingo daqui a pelo menos oito dias; se o par não couber até o fim do ano do clube (fim de dezembro
 * e janeiro), os dois últimos domingos que cabem.
 */
function domingosDoCronograma(): { conflito: string; livre: string } {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const fimDoPeriodo = `${anoCorrente()}-12-31`
  const ehDomingo = (data: string): boolean => new Date(`${data}T00:00:00Z`).getUTCDay() === 0
  let conflito = somarDias(hoje, 8)
  while (!ehDomingo(conflito)) conflito = somarDias(conflito, 1)
  if (somarDias(conflito, 7) > fimDoPeriodo) {
    conflito = somarDias(fimDoPeriodo, -7)
    while (!ehDomingo(conflito)) conflito = somarDias(conflito, -1)
  }
  return { conflito, livre: somarDias(conflito, 7) }
}

const diaMes = (data: string): string => `${data.slice(8, 10)}/${data.slice(5, 7)}`

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA_DE_TESTE)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function novaSessao(browser: Browser, email: string, viewport?: { width: number; height: number }): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: process.env['E2E_WEB_URL'], viewport })
  const page = await contexto.newPage()
  await entrar(page, email)
  return page
}

async function lerCronograma(api: APIRequestContext, classeId: string): Promise<LeituraDoCronograma> {
  return (await (await api.get(`/api/classes/${classeId}/cronograma`)).json()) as LeituraDoCronograma
}

async function apiDo(autorizacao: string): Promise<APIRequestContext> {
  return request.newContext({ baseURL: process.env['E2E_API_URL'], extraHTTPHeaders: { Authorization: autorizacao } })
}

test('adm: evento em conflito avisa o instrutor, ele monta e envia, o Adm publica e o outro instrutor lê o publicado', async ({ browser }) => {
  const clube = await criarClube()
  const amigo = await classeOficial('Amigo')
  await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, quemMontaCronograma: 'INSTRUTOR' })

  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
  const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
  const outroInstrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })

  const requisitos = await prismaDeTeste().requisito.findMany({
    where: { ativo: true, secao: { classeId: amigo.id } },
    orderBy: [{ secao: { ordem: 'asc' } }, { ordem: 'asc' }],
    take: 4,
  })
  const [primeiro, segundo, livre] = requisitos
  if (!primeiro || !segundo || !livre) throw new Error('A classe Amigo precisa de ao menos 3 requisitos na carga oficial')

  const { conflito: domingoDoConflito, livre: domingoLivre } = domingosDoCronograma()
  const cronograma = await criarCronograma({
    clubeId: clube.id,
    classeId: amigo.id,
    anoClube: anoCorrente(),
    aulas: [{ data: domingoDoConflito, requisitoIds: [primeiro.id, segundo.id] }],
  })

  // Adm cria o "Sem reunião" no domingo da aula e vê o aviso de quantas aulas isso afeta.
  const paginaAdm = await novaSessao(browser, adm.usuario.email)
  await paginaAdm.goto('/adm/calendario')
  await paginaAdm.getByRole('link', { name: 'Novo evento' }).click()
  await paginaAdm.getByLabel('Nome', { exact: true }).fill('Sem reunião')
  await paginaAdm.getByLabel('Tipo').selectOption({ label: 'Sem reunião' })
  await paginaAdm.getByLabel('Início').fill(domingoDoConflito)
  await paginaAdm.getByLabel('Fim').fill(domingoDoConflito)
  await paginaAdm.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(paginaAdm.getByRole('heading', { level: 1, name: 'Sem reunião' })).toBeVisible()
  await expect(paginaAdm.getByText(`1 aula estava marcada nessas datas: Amigo (${diaMes(domingoDoConflito)}). Os instrutores foram avisados.`)).toBeVisible()

  // O instrutor vê o aviso no sino e a aula em conflito na leitura do cronograma.
  const paginaInstrutor = await novaSessao(browser, instrutor.usuario.email, CELULAR)
  await paginaInstrutor.goto('/notificacoes')
  await expect(paginaInstrutor.getByText('Aula em conflito com o calendário')).toBeVisible()
  await expect(paginaInstrutor.getByText(`Amigo: ${diaMes(domingoDoConflito)} deixou de ser dia de aula.`)).toBeVisible()

  const apiInstrutor = await apiDo(instrutor.autorizacao)
  const leituraEmConflito = await lerCronograma(apiInstrutor, amigo.id)
  expect(leituraEmConflito.aulas).toEqual(expect.arrayContaining([expect.objectContaining({ data: domingoDoConflito, situacao: 'CONFLITO' })]))

  // No celular, o instrutor liberado põe um requisito sem data numa data livre e envia ao Adm.
  await paginaInstrutor.goto(`/cronograma/montar?classe=${amigo.id}`)
  await paginaInstrutor.locator(`li[data-data="${domingoDoConflito}"]`).getByText(/Conflito/).waitFor()
  await paginaInstrutor.locator(`li[data-data="${domingoLivre}"]`).getByRole('button', { name: 'Adicionar requisito nesta data' }).click()
  await paginaInstrutor.getByRole('button', { name: `${livre.codigo} · ${livre.texto}` }).click()
  await paginaInstrutor.getByRole('button', { name: 'Adicionar 1 requisito' }).click()
  await expect(paginaInstrutor.locator(`li[data-data="${domingoLivre}"]`).getByText(livre.texto)).toBeVisible()
  await paginaInstrutor.getByRole('button', { name: 'Enviar para o Adm publicar' }).click()
  await paginaInstrutor.getByRole('dialog').getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(async () => {
    const vivo = await lerCronograma(apiInstrutor, amigo.id)
    expect(vivo.status).toBe('ENVIADO')
  }).toPass()

  // O Adm abre o cronograma da classe em A7 e publica.
  await paginaAdm.goto(`/adm/cronogramas?classe=${amigo.id}`)
  const publicacaoConcluida = paginaAdm.waitForResponse(
    (resposta) => /\/api\/cronogramas\/[^/]+\/publicar$/.test(resposta.url()) && resposta.request().method() === 'POST',
  )
  await paginaAdm.getByRole('button', { name: 'Publicar' }).click()
  expect((await publicacaoConcluida).ok()).toBe(true)

  // Com a classe devolvida ao Adm, o outro instrutor lê o que foi publicado.
  await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, quemMontaCronograma: 'ADM' })
  const apiOutro = await apiDo(outroInstrutor.autorizacao)
  const publicado = await lerCronograma(apiOutro, amigo.id)
  expect(publicado).toMatchObject({ cronogramaId: cronograma.id, fonte: 'PUBLICADO', status: 'PUBLICADO', podeMontar: false })
  const aulaNova = publicado.aulas.find((aula) => aula.data === domingoLivre)
  expect(aulaNova?.requisitos).toEqual([expect.objectContaining({ id: livre.id })])
})
