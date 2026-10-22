import { randomUUID } from 'node:crypto'
import { expect, request, test } from '@playwright/test'
import type { APIRequestContext, Browser, Page } from '@playwright/test'
import { escolher } from './apoio/escolher'
import {
  admDefinirClasseClube,
  anoCorrente,
  classeOficial,
  criarAcesso,
  criarClube,
  criarCronograma,
  criarDbv,
  criarUnidade,
  criarUsuario,
  criarVinculo,
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

/** PDF de uma página em branco, com tabela de referências cruzadas de verdade: só ASCII, então posição em texto é posição em bytes. */
function pdfMinimo(): Buffer {
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
  ]
  let conteudo = '%PDF-1.4\n'
  const posicoes = objetos.map((objeto, indice) => {
    const posicao = conteudo.length
    conteudo += `${indice + 1} 0 obj\n${objeto}\nendobj\n`
    return posicao
  })
  const linhasDaTabela = posicoes.map((posicao) => `${String(posicao).padStart(10, '0')} 00000 n \n`).join('')
  conteudo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${linhasDaTabela}`
  conteudo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${conteudo.indexOf('xref\n')}\n%%EOF\n`
  return Buffer.from(conteudo, 'latin1')
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

  // Adm cria o "Sem reunião" no domingo da classe e vê o aviso de quantas classes isso afeta.
  const paginaAdm = await novaSessao(browser, adm.usuario.email)
  await paginaAdm.goto('/adm/calendario')
  await paginaAdm.getByRole('link', { name: 'Novo evento' }).click()
  await paginaAdm.getByRole('link', { name: /^Sem reunião/ }).click()
  await paginaAdm.getByLabel('Nome', { exact: true }).fill('Sem reunião')
  await paginaAdm.getByLabel('Início').fill(domingoDoConflito)
  await paginaAdm.getByLabel('Fim').fill(domingoDoConflito)
  await paginaAdm.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(paginaAdm.getByRole('heading', { level: 1, name: 'Sem reunião' })).toBeVisible()
  await expect(paginaAdm.getByText(`1 classe estava marcada nessas datas: Amigo (${diaMes(domingoDoConflito)}). Os instrutores foram avisados.`)).toBeVisible()

  // O instrutor vê o aviso no sino e a classe em conflito na leitura do cronograma.
  const paginaInstrutor = await novaSessao(browser, instrutor.usuario.email, CELULAR)
  await paginaInstrutor.goto('/notificacoes')
  await expect(paginaInstrutor.getByText('Classe em conflito com o calendário')).toBeVisible()
  await expect(paginaInstrutor.getByText(`Amigo: ${diaMes(domingoDoConflito)} deixou de ser dia de classe.`)).toBeVisible()

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

test('adm: arrasta um requisito da lista até a linha da data e ele grava como o "Colocar aqui"', async ({ browser }) => {
  const clube = await criarClube()
  const amigo = await classeOficial('Amigo')
  await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, quemMontaCronograma: 'ADM' })
  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
  const requisitos = await prismaDeTeste().requisito.findMany({
    where: { ativo: true, secao: { classeId: amigo.id } },
    orderBy: [{ secao: { ordem: 'asc' } }, { ordem: 'asc' }],
    take: 2,
  })
  const [colocado, solto] = requisitos
  if (!colocado || !solto) throw new Error('A classe Amigo precisa de ao menos 2 requisitos na carga oficial')

  const { conflito: primeiroDomingo, livre: segundoDomingo } = domingosDoCronograma()
  const cronograma = await criarCronograma({
    clubeId: clube.id,
    classeId: amigo.id,
    anoClube: anoCorrente(),
    aulas: [{ data: primeiroDomingo, requisitoIds: [colocado.id] }, { data: segundoDomingo, requisitoIds: [] }],
  })

  const pagina = await novaSessao(browser, adm.usuario.email)
  await pagina.goto(`/adm/cronogramas?classe=${amigo.id}`)
  const gravacao = pagina.waitForResponse(
    (resposta) => resposta.url().includes(`/api/cronogramas/${cronograma.id}/requisitos/${solto.id}`) && resposta.request().method() === 'PUT',
  )
  await pagina.getByRole('button', { name: new RegExp(solto.texto.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).dragTo(pagina.locator(`li[data-data="${segundoDomingo}"]`))
  expect((await gravacao).ok()).toBe(true)
  await expect(pagina.locator(`li[data-data="${segundoDomingo}"]`).getByText(solto.texto)).toBeVisible()

  const api = await apiDo((await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })).autorizacao)
  const vivo = await lerCronograma(api, amigo.id)
  expect(vivo.aulas.find((aula) => aula.data === segundoDomingo)?.requisitos).toEqual([expect.objectContaining({ id: solto.id })])
})

test('adm: ao remover o papel de conselheiro de quem está logado como conselheiro, a pessoa volta à escolha só com Instrutor', async ({ browser }) => {
  const clube = await criarClube()
  const amigo = await classeOficial('Amigo')
  await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, ativa: true })
  const unidade = await criarUnidade({ clubeId: clube.id })

  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
  const pessoa = await criarUsuario({ nome: 'Duda Dupla' })
  await criarVinculo({ usuarioId: pessoa.id, clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
  await criarVinculo({ usuarioId: pessoa.id, clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })

  // A pessoa entra, escolhe conselheiro e fica com esse papel em uso.
  const paginaDaPessoa = await novaSessao(browser, pessoa.email, CELULAR)
  await expect(paginaDaPessoa.getByRole('heading', { level: 1, name: 'Como você quer entrar?' })).toBeVisible()
  await paginaDaPessoa.getByRole('button', { name: /Conselheiro/ }).click()
  await expect(paginaDaPessoa).toHaveURL(/\/inicio$/)

  // O Adm remove o papel de conselheiro pela ficha.
  const paginaAdm = await novaSessao(browser, adm.usuario.email)
  await paginaAdm.goto(`/adm/usuarios/${pessoa.id}`)
  await expect(paginaAdm.getByRole('heading', { level: 1, name: 'Duda Dupla' })).toBeVisible()
  await paginaAdm.getByRole('region', { name: /Conselheir/ }).getByRole('button', { name: 'Remover papel' }).click()
  await paginaAdm.getByRole('dialog').getByRole('button', { name: 'Remover papel' }).click()
  await expect(paginaAdm.getByRole('region', { name: /Conselheir/ })).toHaveCount(0)

  // No próximo toque dentro do app o pedido é recusado e a pessoa vai à escolha de papel, que já só oferece Instrutor.
  await paginaDaPessoa.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Unidade', exact: true }).click()
  await expect(paginaDaPessoa).toHaveURL(/\/papel$/)
  await expect(paginaDaPessoa.getByRole('heading', { level: 1, name: 'Como você quer entrar?' })).toBeVisible()
  await expect(paginaDaPessoa.getByRole('button', { name: /Instrutor/ })).toBeVisible()
  await expect(paginaDaPessoa.getByRole('button', { name: /Conselheiro/ })).toHaveCount(0)
})

test('biblioteca: o Adm adiciona um PDF em Livros e o conselheiro o vê na estante com o "Ler" apontando para o arquivo', async ({ browser }) => {
  const clube = await criarClube()
  const unidade = await criarUnidade({ clubeId: clube.id })
  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
  const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
  const nomeDoItem = `Livro de teste ${randomUUID().slice(0, 8)}`

  // O Adm escolhe o PDF, troca o nome sugerido pelo próprio e põe o item em Livros.
  const paginaAdm = await novaSessao(browser, adm.usuario.email)
  await paginaAdm.goto('/adm/biblioteca')
  await paginaAdm.getByRole('button', { name: 'Adicionar à biblioteca' }).click()
  const dialogo = paginaAdm.getByRole('dialog', { name: 'Adicionar à biblioteca' })
  await dialogo.getByLabel('PDF', { exact: true }).setInputFiles({ name: 'arquivo-de-teste.pdf', mimeType: 'application/pdf', buffer: pdfMinimo() })
  await dialogo.getByLabel('Nome', { exact: true }).fill(nomeDoItem)
  await escolher(paginaAdm, dialogo.getByLabel('Categoria', { exact: true }), { label: 'Livros' })
  await dialogo.getByRole('button', { name: 'Adicionar', exact: true }).click()
  await expect(dialogo).toHaveCount(0)
  await expect(paginaAdm.getByRole('region', { name: 'Livros' }).getByRole('listitem').filter({ hasText: nomeDoItem })).toBeVisible()

  // O conselheiro abre a estante e acha o cartão na prateleira Livros; o "Ler" leva ao arquivo original.
  const paginaConselheiro = await novaSessao(browser, conselheiro.usuario.email, CELULAR)
  await paginaConselheiro.goto('/biblioteca')
  const cartao = paginaConselheiro.getByRole('region', { name: 'Livros' }).getByRole('listitem').filter({ hasText: nomeDoItem })
  await expect(cartao).toBeVisible()
  await expect(cartao.getByRole('link', { name: `Ler ${nomeDoItem}` })).toHaveAttribute('href', /\/api\/arquivos\/[^?]+\?.*\bv=original\b/)
})

test('biblioteca: o Adm cadastra um livro físico, empresta um exemplar a um desbravador e registra a devolução', async ({ browser }) => {
  const clube = await criarClube()
  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
  const sufixo = randomUUID().slice(0, 8)
  const nomeDoLivro = `Livro físico ${sufixo}`
  const nomeDoDesbravador = `Beatriz Biblioteca ${sufixo}`
  await criarDbv({ clubeId: clube.id, nome: nomeDoDesbravador })

  // O Adm cadastra o livro físico com dois exemplares, na aba Livros físicos.
  const pagina = await novaSessao(browser, adm.usuario.email)
  await pagina.goto('/adm/biblioteca')
  await pagina.getByRole('tab', { name: 'Livros físicos' }).click()
  await pagina.getByRole('button', { name: 'Adicionar à biblioteca' }).click()
  const cadastro = pagina.getByRole('dialog', { name: 'Adicionar à biblioteca' })
  await cadastro.getByRole('radio', { name: 'Livro físico' }).check()
  await cadastro.getByLabel('Nome', { exact: true }).fill(nomeDoLivro)
  await escolher(pagina, cadastro.getByLabel('Categoria', { exact: true }), { label: 'Livros' })
  await cadastro.getByLabel('Quantidade de exemplares').fill('2')
  await cadastro.getByRole('button', { name: 'Adicionar', exact: true }).click()
  await expect(cadastro).toHaveCount(0)
  const cartao = pagina.getByRole('region', { name: 'Livros' }).getByRole('listitem').filter({ hasText: nomeDoLivro })
  await expect(cartao.getByText('2 de 2 disponíveis')).toBeVisible()

  // Pelo cartão, o menor exemplar livre é emprestado a um desbravador achado pelo nome.
  await cartao.getByRole('button', { name: `Emprestar ${nomeDoLivro}` }).click()
  const emprestar = pagina.getByRole('dialog', { name: `Emprestar “${nomeDoLivro}”` })
  await expect(emprestar.getByText('Exemplar 1 · disponível')).toBeVisible()
  await emprestar.getByLabel('Desbravador', { exact: true }).fill('Beatriz Biblioteca')
  await emprestar.getByRole('button', { name: new RegExp(nomeDoDesbravador) }).click()
  await emprestar.getByRole('button', { name: 'Registrar empréstimo' }).click()
  await expect(emprestar).toHaveCount(0)
  await expect(cartao.getByText('1 de 2 disponíveis')).toBeVisible()

  // O empréstimo aparece na aba Empréstimos e a devolução o tira de lá.
  await pagina.getByRole('tab', { name: /Empréstimos/ }).click()
  const linha = pagina.getByRole('row').filter({ hasText: nomeDoDesbravador })
  await expect(linha.getByText('No prazo')).toBeVisible()
  await linha.getByRole('button', { name: /^Devolver/ }).click()
  await pagina.getByRole('dialog', { name: 'Registrar devolução' }).getByRole('button', { name: 'Registrar devolução' }).click()
  await expect(pagina.getByText('Nenhum livro emprestado agora')).toBeVisible()
})
