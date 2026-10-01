import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { criarClube, criarDbv, criarAcesso, criarEvento, criarMembro, criarReuniao, criarUnidade, criarUsuario, criarVinculo, SENHA_DE_TESTE } from './apoio/semear'

test.use({ baseURL: process.env['E2E_WEB_URL'] })

const MES_DO_EVENTO = '2027-03'
const DATA_DO_EVENTO = `${MES_DO_EVENTO}-10`
const DATA_DA_REUNIAO = '2026-03-01'
const LARGURAS = [390, 820, 1280]
const POR_PAGINA = 25

async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(SENHA_DE_TESTE)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function clubeComAdm(page: Page): Promise<{ clubeId: string }> {
  const clube = await criarClube()
  const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
  await entrar(page, adm.usuario.email)
  return { clubeId: clube.id }
}

const parametros = (page: Page): URLSearchParams => new URL(page.url()).searchParams

/** Nomes que ordenam juntos e passam de uma página: o último fica na segunda. */
const nomesEmVariasPaginas = (prefixo: string): string[] =>
  Array.from({ length: POR_PAGINA + 1 }, (_, indice) => `${prefixo} ${String(indice + 1).padStart(2, '0')}`)

test.describe('fichas e telas de edição do Adm', () => {
  test('desbravador: lista, ficha, edição e volta com filtro e página', async ({ page }) => {
    const { clubeId } = await clubeComAdm(page)
    const prefixo = `Zeta${Date.now().toString(36)}`
    for (const nome of nomesEmVariasPaginas(prefixo)) await criarDbv({ clubeId, nome })

    await page.goto(`/adm/desbravadores?busca=${prefixo}&pagina=2`)
    await expect(page.getByText('26 cadastrados')).toBeVisible()
    await page.getByRole('link', { name: new RegExp(prefixo) }).click()
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(prefixo) })).toBeVisible()

    await page.getByRole('link', { name: 'Editar', exact: true }).click()
    await expect(page.getByText('Editar desbravador')).toBeVisible()
    await page.getByLabel('Nome público').fill('Apelido Novo')
    await page.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(prefixo) })).toBeVisible()
    await expect(page.getByText('Apelido Novo')).toBeVisible()

    await page.getByRole('link', { name: 'Voltar para Desbravadores' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Desbravadores' })).toBeVisible()
    expect(parametros(page).get('busca')).toBe(prefixo)
    expect(parametros(page).get('pagina')).toBe('2')
  })

  test('usuário: lista, ficha, edição e volta com filtro e página', async ({ page }) => {
    const { clubeId } = await clubeComAdm(page)
    const prefixo = `Zeta${Date.now().toString(36)}`
    for (const nome of nomesEmVariasPaginas(prefixo)) {
      const usuario = await criarUsuario({ nome, status: 'CONVIDADO' })
      await criarVinculo({ usuarioId: usuario.id, clubeId, papel: 'INSTRUTOR' })
    }

    await page.goto(`/adm/usuarios?busca=${prefixo}&pagina=2`)
    await page.getByRole('link', { name: new RegExp(prefixo) }).click()
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(prefixo) })).toBeVisible()

    await page.getByRole('link', { name: 'Editar', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Editar usuário' })).toBeVisible()
    await page.getByLabel('Nome', { exact: true }).fill(`${prefixo} Renomeado`)
    await page.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `${prefixo} Renomeado` })).toBeVisible()

    await page.getByRole('link', { name: 'Voltar para Usuários' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Usuários' })).toBeVisible()
    expect(parametros(page).get('busca')).toBe(prefixo)
    expect(parametros(page).get('pagina')).toBe('2')
  })

  test('unidade: lista, ficha, edição e volta', async ({ page }) => {
    const { clubeId } = await clubeComAdm(page)
    const unidade = await criarUnidade({ clubeId, nome: `Águias ${Date.now().toString(36)}` })

    await page.goto('/adm/unidades')
    await page.getByRole('link', { name: unidade.nome }).click()
    await expect(page.getByRole('heading', { level: 1, name: unidade.nome })).toBeVisible()

    await page.getByRole('link', { name: 'Editar', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Editar ${unidade.nome}` })).toBeVisible()
    await page.getByLabel('Grito de guerra').fill('Voar mais alto')
    await page.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(page.getByRole('heading', { level: 1, name: unidade.nome })).toBeVisible()
    await expect(page.getByText('“Voar mais alto”')).toBeVisible()

    await page.getByRole('link', { name: 'Voltar para Unidades' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Unidades' })).toBeVisible()
    await expect(page).toHaveURL(/\/adm\/unidades$/)
  })

  test('evento: calendário, ficha, edição e volta ao mês', async ({ page }) => {
    const { clubeId } = await clubeComAdm(page)
    const evento = await criarEvento({ clubeId, tipo: 'EVENTO', inicio: DATA_DO_EVENTO })

    await page.goto(`/adm/calendario?mes=${MES_DO_EVENTO}`)
    await page.getByRole('list', { name: /^Eventos de / }).getByRole('link', { name: evento.nome }).click()
    await expect(page.getByRole('heading', { level: 1, name: evento.nome })).toBeVisible()

    await page.getByRole('link', { name: 'Editar', exact: true }).click()
    await expect(page.getByText('Editar evento')).toBeVisible()
    await page.getByLabel('Local').fill('Salão E2E')
    await page.getByRole('button', { name: 'Salvar alterações' }).click()
    await expect(page.getByRole('heading', { level: 1, name: evento.nome })).toBeVisible()
    await expect(page.getByText('Salão E2E')).toBeVisible()

    await page.getByRole('link', { name: 'Voltar para Calendário do clube' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Calendário do clube' })).toBeVisible()
    expect(parametros(page).get('mes')).toBe(MES_DO_EVENTO)
  })

  test('o Adm corrige a chamada de uma reunião e volta à ficha da reunião', async ({ page }) => {
    const { clubeId } = await clubeComAdm(page)
    const unidade = await criarUnidade({ clubeId, nome: `Falcões ${Date.now().toString(36)}` })
    const dbv = await criarDbv({ clubeId, nome: 'Dani Falcão' })
    await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-02-01' })
    const reuniao = await criarReuniao({ unidadeId: unidade.id, data: DATA_DA_REUNIAO, chamada: [{ dbvId: dbv.id, situacao: 'PRESENTE' }] })

    await page.goto(`/adm/reunioes/${reuniao.id}`)
    await expect(page.getByText('Nenhuma correção desde o registro.')).toBeVisible()
    await page.getByRole('link', { name: 'Corrigir chamada' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Corrigir chamada' })).toBeVisible()

    const linha = page.getByRole('listitem', { name: 'Dani Falcão' })
    await linha.getByRole('button', { name: 'Uniforme' }).click()
    await page.getByRole('button', { name: /Salvar chamada/ }).click()

    await expect(page).toHaveURL(new RegExp(`/adm/reunioes/${reuniao.id}$`))
    await expect(page.getByText(/^Corrigida por .+ em /)).toBeVisible()
    await expect(page.getByRole('link', { name: `Voltar para ${unidade.nome}` })).toBeVisible()
  })

  test('links diretos para ficha e edição abrem; id malformado diz "Não encontramos"', async ({ page }) => {
    const { clubeId } = await clubeComAdm(page)
    const unidade = await criarUnidade({ clubeId })
    const dbv = await criarDbv({ clubeId, nome: 'Eva Direta' })
    const usuario = await criarUsuario({ nome: 'Fábio Direto', status: 'CONVIDADO' })
    await criarVinculo({ usuarioId: usuario.id, clubeId, papel: 'INSTRUTOR' })
    const evento = await criarEvento({ clubeId, tipo: 'FERIADO', inicio: DATA_DO_EVENTO })

    const diretos: { caminho: string; titulo: string | RegExp }[] = [
      { caminho: `/adm/desbravadores/${dbv.id}`, titulo: 'Eva Direta' },
      { caminho: `/adm/desbravadores/${dbv.id}/editar`, titulo: 'Eva Direta' },
      { caminho: `/adm/usuarios/${usuario.id}`, titulo: 'Fábio Direto' },
      { caminho: `/adm/usuarios/${usuario.id}/editar`, titulo: 'Editar usuário' },
      { caminho: `/adm/unidades/${unidade.id}`, titulo: unidade.nome },
      { caminho: `/adm/unidades/${unidade.id}/editar`, titulo: `Editar ${unidade.nome}` },
      { caminho: `/adm/calendario/eventos/${evento.id}`, titulo: evento.nome },
      { caminho: `/adm/calendario/eventos/${evento.id}/editar`, titulo: evento.nome },
    ]
    for (const { caminho, titulo } of diretos) {
      await page.goto(caminho)
      await expect(page.getByRole('heading', { level: 1, name: titulo }), caminho).toBeVisible()
    }

    const malformados: { caminho: string; registro: string }[] = [
      { caminho: '/adm/desbravadores/nao-e-um-id', registro: 'este desbravador' },
      { caminho: '/adm/desbravadores/nao-e-um-id/editar', registro: 'este desbravador' },
      { caminho: '/adm/usuarios/nao-e-um-id', registro: 'este usuário' },
      { caminho: '/adm/unidades/nao-e-um-id', registro: 'esta unidade' },
      { caminho: '/adm/calendario/eventos/nao-e-um-id', registro: 'este evento' },
      { caminho: '/adm/calendario/eventos/nao-e-um-id/editar', registro: 'este evento' },
      { caminho: '/adm/reunioes/nao-e-um-id', registro: 'esta reunião' },
      { caminho: '/adm/reunioes/nao-e-um-id/chamada', registro: 'esta reunião' },
    ]
    for (const { caminho, registro } of malformados) {
      await page.goto(caminho)
      await expect(page.getByText(`Não encontramos ${registro}`), caminho).toBeVisible()
    }
  })

  test('nenhuma ficha nem tela de edição rola de lado ou tem elemento fixo, em 390, 820 e 1280', async ({ page }) => {
    test.setTimeout(240_000)
    const { clubeId } = await clubeComAdm(page)
    const unidade = await criarUnidade({ clubeId })
    const dbv = await criarDbv({ clubeId, nome: 'Gabi Medida' })
    const usuario = await criarUsuario({ nome: 'Hugo Medido', status: 'CONVIDADO' })
    await criarVinculo({ usuarioId: usuario.id, clubeId, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
    const evento = await criarEvento({ clubeId, tipo: 'ACAMPAMENTO', inicio: DATA_DO_EVENTO })
    const reuniao = await criarReuniao({ unidadeId: unidade.id, data: DATA_DA_REUNIAO, chamada: [{ dbvId: dbv.id }] })

    const caminhos = [
      `/adm/desbravadores/${dbv.id}`,
      `/adm/desbravadores/${dbv.id}/editar`,
      '/adm/desbravadores/novo',
      `/adm/usuarios/${usuario.id}`,
      `/adm/usuarios/${usuario.id}/editar`,
      '/adm/usuarios/novo',
      `/adm/unidades/${unidade.id}`,
      `/adm/unidades/${unidade.id}/editar`,
      '/adm/unidades/nova',
      `/adm/calendario/eventos/${evento.id}`,
      `/adm/calendario/eventos/${evento.id}/editar`,
      '/adm/calendario/eventos/novo',
      `/adm/reunioes/${reuniao.id}`,
      `/adm/reunioes/${reuniao.id}/chamada`,
    ]

    const falhas: string[] = []
    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: 900 })
      for (const caminho of caminhos) {
        await page.goto(caminho)
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
        const medida = await page.evaluate(() => ({
          rolagemLateral: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          presos: [...document.querySelectorAll('body *')].filter((e) => ['fixed', 'sticky'].includes(getComputedStyle(e).position)).length,
        }))
        if (medida.rolagemLateral !== 0 || medida.presos !== 0) falhas.push(`${caminho} em ${largura}px: ${JSON.stringify(medida)}`)
      }
    }
    expect(falhas).toEqual([])
  })
})
