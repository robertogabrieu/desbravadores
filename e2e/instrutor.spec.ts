import { randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  anoCorrente,
  classeOficial,
  criarClube,
  criarCronograma,
  criarDbv,
  criarMatricula,
  criarSessao,
  criarUsuario,
  criarVinculo,
  prismaDeTeste,
  publicarCronograma,
  SENHA_DE_TESTE,
} from './apoio/semear'

test.use({ baseURL: process.env['E2E_WEB_URL'] })

const API = process.env['E2E_API_URL'] ?? ''

async function pontosDoRanking(token: string, dbvId: string): Promise<number> {
  const resposta = await fetch(`${API}/api/ranking`, { headers: { Authorization: `Bearer ${token}` } })
  expect(resposta.status).toBe(200)
  const corpo = (await resposta.json()) as { itens: { dbvId: string; pontos: number }[] }
  return corpo.itens.find((item) => item.dbvId === dbvId)?.pontos ?? 0
}

async function concluidosDoDbv(token: string, dbvId: string): Promise<number> {
  const resposta = await fetch(`${API}/api/desbravadores/${dbvId}/progresso`, { headers: { Authorization: `Bearer ${token}` } })
  expect(resposta.status).toBe(200)
  const corpo = (await resposta.json()) as { matriculas: { concluidos: number }[] }
  return corpo.matriculas.reduce((soma, matricula) => soma + matricula.concluidos, 0)
}

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA_DE_TESTE)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test('instrutor: a aula registrada sem rede chega sozinha, sobe o progresso e os pontos', async ({ page, context }) => {
  const id = randomBytes(3).toString('hex')
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const email = `instrutor-${id}@e2e.local`
  const nomes = [`Ana Amiga ${id}`, `Bia Amiga ${id}`]

  // Cenário: classe oficial com dois desbravadores cursando, aula planejada de hoje com 2 requisitos.
  const clube = await criarClube()
  const classe = await classeOficial('Amigo')
  const requisitos = await prismaDeTeste().requisito.findMany({
    where: { secao: { classeId: classe.id }, ativo: true },
    orderBy: [{ secao: { ordem: 'asc' } }, { ordem: 'asc' }],
    take: 2,
  })
  expect(requisitos).toHaveLength(2)
  const dbvs = []
  for (const nome of nomes) {
    const dbv = await criarDbv({ clubeId: clube.id, nome, sexo: 'F' })
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: classe.id, anoClube: anoCorrente() })
    dbvs.push(dbv)
  }
  const usuario = await criarUsuario({ email })
  const vinculo = await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
  const cronograma = await criarCronograma({
    clubeId: clube.id,
    classeId: classe.id,
    status: 'PUBLICADO',
    aulas: [{ data: hoje, requisitoIds: requisitos.map((requisito) => requisito.id) }],
  })
  await publicarCronograma({ cronogramaId: cronograma.id, publicadoPorId: usuario.id })
  const token = criarSessao({ usuarioId: usuario.id, vinculoId: vinculo.id })
  const [ana, bia] = dbvs
  if (!ana || !bia) throw new Error('semeadura incompleta')

  expect(await concluidosDoDbv(token, ana.id)).toBe(0)

  // Com internet: entra e o app baixa o pacote do instrutor.
  await entrar(page, email)
  await page.waitForFunction('navigator.serviceWorker.controller !== null')
  await page.goto(`/aulas/nova?classe=${classe.id}&data=${hoje}`)
  await expect(page.getByRole('heading', { name: 'Registro de aula' })).toBeVisible()
  await expect(page.getByRole('listitem', { name: nomes[0] })).toBeVisible()

  // Sem rede: aula nova começa com todos presentes; Ana conclui os 2 requisitos e Bia falta.
  await context.setOffline(true)
  for (const requisito of requisitos) {
    await page.getByRole('button', { name: `${requisito.codigo} · ${nomes[0]}` }).click()
  }
  await page.getByRole('listitem', { name: nomes[1] }).getByRole('button', { name: new RegExp(`^${nomes[1]}`) }).click()
  await page.getByRole('button', { name: /Salvar aula · 1 presentes/ }).click()
  await expect(page.getByText(/aguardando envio/).first()).toBeVisible()
  expect(await concluidosDoDbv(token, ana.id)).toBe(0)

  // A rede volta: a fila envia sozinha.
  await context.setOffline(false)
  await expect.poll(() => concluidosDoDbv(token, ana.id), { timeout: 45_000 }).toBe(2)
  expect(await concluidosDoDbv(token, bia.id)).toBe(0)

  // Reabre a aula com rede: o registro está lá, sem nada aguardando envio.
  await page.goto(`/aulas/nova?classe=${classe.id}&data=${hoje}`)
  await expect(page.getByRole('button', { name: `${requisitos[0]?.codigo} · ${nomes[0]}`, pressed: true })).toBeVisible()
  await expect(page.getByRole('button', { name: `${requisitos[1]?.codigo} · ${nomes[0]}`, pressed: true })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(`^${nomes[0]}`), pressed: true })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(`^${nomes[1]}`), pressed: false })).toBeVisible()

  // Pontos: 2 requisitos da Ana (4 cada); a Bia não concluiu nenhum.
  const pontosAna = await pontosDoRanking(token, ana.id)
  const pontosBia = await pontosDoRanking(token, bia.id)
  expect(pontosAna - pontosBia).toBe(8)
})
