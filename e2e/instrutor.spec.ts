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
  criarRegistroAula,
  criarSessao,
  criarTarefa,
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

const hojeEmSaoPaulo = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

/** `AAAA-MM-DD` de `dias` antes de `data`. */
const diasAntes = (data: string, dias: number): string => new Date(Date.parse(`${data}T12:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10)

const dataCurta = (data: string): string => `${data.slice(8, 10)}/${data.slice(5, 7)}`

interface MedidaDoRegistro {
  rolagemDaPagina: number
  presos: number
}

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA_DE_TESTE)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test('instrutor: a classe registrada sem rede chega sozinha, sobe o progresso e os pontos', async ({ page, context }) => {
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
  await expect(page.getByRole('heading', { name: 'Registro de classe' })).toBeVisible()
  await expect(page.getByRole('listitem', { name: nomes[0] })).toBeVisible()

  // Sem rede: registro novo começa com todos presentes; Ana conclui os 2 requisitos e Bia falta.
  await context.setOffline(true)
  for (const requisito of requisitos) {
    await page.getByRole('button', { name: `${requisito.codigo} · ${nomes[0]}` }).click()
  }
  await page.getByRole('listitem', { name: nomes[1] }).getByRole('button', { name: new RegExp(`^${nomes[1]}`) }).click()
  await page.getByRole('button', { name: /Salvar classe · 1 presentes/ }).click()
  await expect(page.getByText(/aguardando envio/).first()).toBeVisible()
  expect(await concluidosDoDbv(token, ana.id)).toBe(0)

  // A rede volta: a fila envia sozinha.
  await context.setOffline(false)
  await expect.poll(() => concluidosDoDbv(token, ana.id), { timeout: 45_000 }).toBe(2)
  expect(await concluidosDoDbv(token, bia.id)).toBe(0)

  // Reabre o registro com rede: o registro está lá, sem nada aguardando envio.
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

test('instrutor: passa um requisito para casa sem rede e cobra a tarefa no registro seguinte', async ({ page, context }) => {
  const id = randomBytes(3).toString('hex')
  const hoje = hojeEmSaoPaulo()
  const ontem = diasAntes(hoje, 1)
  const email = `instrutor-tarefa-${id}@e2e.local`
  const nomes = [`Ana Tarefa ${id}`, `Bia Tarefa ${id}`]

  const clube = await criarClube()
  const classe = await classeOficial('Amigo')
  const requisito = await prismaDeTeste().requisito.findFirstOrThrow({
    where: { secao: { classeId: classe.id }, ativo: true },
    orderBy: [{ secao: { ordem: 'asc' } }, { ordem: 'asc' }],
  })
  const dbvs = []
  for (const nome of nomes) {
    const dbv = await criarDbv({ clubeId: clube.id, nome, sexo: 'F' })
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: classe.id, anoClube: anoCorrente() })
    dbvs.push(dbv)
  }
  const usuario = await criarUsuario({ email })
  const vinculo = await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
  const token = criarSessao({ usuarioId: usuario.id, vinculoId: vinculo.id })
  const [ana, bia] = dbvs
  if (!ana || !bia) throw new Error('semeadura incompleta')
  const tarefasDoClube = () => prismaDeTeste().tarefaCasa.count({ where: { clubeId: clube.id } })

  // Com internet: abre o registro de ontem e o app baixa o pacote do instrutor.
  await entrar(page, email)
  await page.waitForFunction('navigator.serviceWorker.controller !== null')
  await page.goto(`/aulas/nova?classe=${classe.id}&data=${ontem}`)
  await expect(page.getByRole('heading', { name: 'Registro de classe' })).toBeVisible()
  await expect(page.getByRole('listitem', { name: nomes[0] })).toBeVisible()

  // Sem rede: passa o requisito para casa e salva; nada chega ao servidor.
  await context.setOffline(true)
  await page.getByLabel('+ Requisito', { exact: true }).selectOption(requisito.id)
  await expect(page.getByRole('list', { name: 'Itens para casa' }).getByText(requisito.codigo, { exact: false })).toBeVisible()
  await page.getByRole('button', { name: /Salvar classe/ }).click()
  await expect(page.getByText(/aguardando envio/).first()).toBeVisible()
  expect(await tarefasDoClube()).toBe(0)

  // A rede volta: a fila envia sozinha e a tarefa passa a existir.
  await context.setOffline(false)
  await expect.poll(tarefasDoClube, { timeout: 45_000 }).toBe(1)
  expect(await concluidosDoDbv(token, ana.id)).toBe(0)

  // Registro seguinte (hoje): a tarefa de ontem abre para cobrar; Ana entrega e a Bia fica sem marcar.
  await page.goto(`/aulas/nova?classe=${classe.id}&data=${hoje}`)
  const bloco = page.getByRole('region', { name: `Cobrar tarefa de ${dataCurta(ontem)}` })
  await expect(bloco).toBeVisible()
  await bloco.getByRole('button', { name: `Entregou: ${requisito.codigo} · ${nomes[0]}` }).click()
  await expect(bloco.getByText('Entregue')).toBeVisible()
  await page.getByRole('button', { name: /Salvar classe/ }).click()

  await expect.poll(() => concluidosDoDbv(token, ana.id), { timeout: 45_000 }).toBe(1)
  expect(await concluidosDoDbv(token, bia.id)).toBe(0)
})

test('instrutor: o registro com três tarefas abertas de seis itens não rola de lado nem tem elemento fixo, em 390, 820 e 1280', async ({ page }) => {
  test.setTimeout(180_000)
  const id = randomBytes(3).toString('hex')
  const hoje = hojeEmSaoPaulo()
  const email = `instrutor-medida-${id}@e2e.local`
  const TAREFAS = 3
  const ITENS_POR_TAREFA = 6

  const clube = await criarClube()
  const classe = await classeOficial('Amigo')
  const requisitos = await prismaDeTeste().requisito.findMany({
    where: { secao: { classeId: classe.id }, ativo: true },
    orderBy: [{ secao: { ordem: 'asc' } }, { ordem: 'asc' }],
    take: TAREFAS * ITENS_POR_TAREFA,
  })
  expect(requisitos).toHaveLength(TAREFAS * ITENS_POR_TAREFA)
  for (const nome of [`Ana Medida ${id}`, `Bia Medida ${id}`]) {
    const dbv = await criarDbv({ clubeId: clube.id, nome, sexo: 'F' })
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: classe.id, anoClube: anoCorrente() })
  }
  const usuario = await criarUsuario({ email })
  await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })

  // Uma tarefa por registro dos três dias anteriores, cada uma com seis requisitos que só ela cobra.
  for (let indice = 0; indice < TAREFAS; indice += 1) {
    const registro = await criarRegistroAula({ clubeId: clube.id, classeId: classe.id, data: diasAntes(hoje, indice + 1) })
    const itens = requisitos.slice(indice * ITENS_POR_TAREFA, (indice + 1) * ITENS_POR_TAREFA).map((requisito) => ({ requisitoId: requisito.id }))
    await criarTarefa({ clubeId: clube.id, classeId: classe.id, registroAulaId: registro.id, itens })
  }

  await entrar(page, email)
  const falhas: string[] = []
  for (const largura of [390, 820, 1280]) {
    await page.setViewportSize({ width: largura, height: 900 })
    await page.goto(`/aulas/nova?classe=${classe.id}&data=${hoje}`)
    await expect(page.getByRole('region', { name: /^Cobrar tarefa de / })).toBeVisible()
    // Abre as duas tarefas anteriores: os três blocos entram na medida.
    const anteriores = page.getByRole('button', { name: '+2 tarefas anteriores' })
    if ((await anteriores.getAttribute('aria-expanded')) !== 'true') await anteriores.click()
    await expect(page.getByRole('region', { name: /^Tarefa de / })).toHaveCount(TAREFAS - 1)

    const pagina = await page.evaluate<MedidaDoRegistro>(`(() => ({
      rolagemDaPagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      presos: [...document.querySelectorAll('body *')].filter((e) => ['fixed', 'sticky'].includes(getComputedStyle(e).position)).length,
    }))()`)
    if (pagina.rolagemDaPagina !== 0 || pagina.presos !== 0) falhas.push(`página em ${largura}px: ${JSON.stringify(pagina)}`)

    const rolagemDosBlocos = await page.evaluate<number[]>(`[...document.querySelectorAll('section')]
      .filter((bloco) => /^(Cobrar tarefa|Tarefa) de /.test(bloco.querySelector('h2')?.textContent ?? ''))
      .map((bloco) => bloco.scrollWidth - bloco.clientWidth)`)
    if (rolagemDosBlocos.length !== TAREFAS) falhas.push(`${rolagemDosBlocos.length} blocos de tarefa em ${largura}px, esperava ${TAREFAS}`)
    rolagemDosBlocos.forEach((rolagem, posicao) => {
      if (rolagem !== 0) falhas.push(`bloco ${posicao + 1} em ${largura}px: rolagem ${rolagem}`)
    })
  }
  expect(falhas).toEqual([])
})
