import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { SECAO_ESPIRITUAL, SECAO_GERAIS, criarMaterial, handlerMateriais, handlerSecoesDaClasse } from '../../testes/handlers/materiais'
import { CLASSE_AMIGO } from '../../testes/handlers/progresso'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaMateriais } from './TelaMateriais'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

const abrir = () => renderizarRotas([{ path: '/classes/:id/materiais', element: <TelaMateriais /> }], `/classes/${CLASSE_AMIGO.id}/materiais`)

const pdf = criarMaterial()
const link = criarMaterial({ id: uuid(1102), secao: SECAO_GERAIS, titulo: 'Requisitos da classe', tipo: 'LINK', url: 'https://adventistas.org/x', bytes: null })
const solto = criarMaterial({ id: uuid(1103), secao: null, titulo: 'Cartaz solto', tipo: 'DOCUMENTO', bytes: 380_000 })

beforeEach(() => {
  estado.modo = 'ONLINE'
  servidor.use(...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_AMIGO] })]), handlerSecoesDaClasse())
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

interface EnvioFeito {
  metodo: string
  url: string
  dados: string
  nomeDoArquivo: string
}

/** O interceptador de XHR do msw não lê o FormData do jsdom: o envio de arquivo usa um XHR falso, como os testes da fila. */
function simularEnvio(status: number, corpo: unknown) {
  const enviados: EnvioFeito[] = []
  class XhrFalso {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    ontimeout: (() => void) | null = null
    onabort: (() => void) | null = null
    status = 0
    responseText = ''
    private metodo = ''
    private url = ''
    open(metodo: string, url: string) {
      this.metodo = metodo
      this.url = url
    }
    setRequestHeader() {}
    send(formulario: FormData) {
      const arquivo = formulario.get('arquivo')
      const dados = formulario.get('dados')
      enviados.push({ metodo: this.metodo, url: this.url, dados: typeof dados === 'string' ? dados : '', nomeDoArquivo: arquivo instanceof File ? arquivo.name : '' })
      this.status = status
      this.responseText = JSON.stringify(corpo)
      this.onload?.()
    }
  }
  vi.stubGlobal('XMLHttpRequest', XhrFalso)
  return { enviados }
}

async function abrirMenuDe(titulo: string) {
  const usuario = userEvent.setup()
  const linha = (await screen.findByText(titulo)).closest('li')
  if (!linha) throw new Error('linha do material não encontrada')
  await usuario.click(within(linha).getByRole('button', { name: /Opções/ }))
  return { usuario, menu: within(screen.getByRole('menu')) }
}

describe('Materiais', () => {
  it('agrupa por seção do caderno, deixa "Sem seção" no fim e conta os itens', async () => {
    servidor.use(handlerMateriais([pdf, link, solto]))
    abrir()
    expect(await screen.findByText('Amigo · 3 itens')).toBeInTheDocument()
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titulos).toEqual(['Descoberta espiritual', 'Gerais', 'Sem seção'])
    expect(screen.getByText('Os 10 Mandamentos – cartões')).toBeInTheDocument()
  })

  it('cada seção e "Sem seção" mostram a contagem de itens no cabeçalho', async () => {
    const outroGeral = criarMaterial({ id: uuid(1104), secao: SECAO_GERAIS, titulo: 'Guia de estudo', tipo: 'DOCUMENTO', bytes: 120_000 })
    servidor.use(handlerMateriais([pdf, link, outroGeral, solto]))
    abrir()
    await screen.findByText('Guia de estudo')
    const contagemDe = (titulo: string) => screen.getByRole('heading', { level: 2, name: titulo }).parentElement?.textContent
    expect(contagemDe('Descoberta espiritual')).toBe('Descoberta espiritual1 item')
    expect(contagemDe('Gerais')).toBe('Gerais2 itens')
    expect(contagemDe('Sem seção')).toBe('Sem seção1 item')
  })

  it('sem materiais mostra o vazio com os botões de envio', async () => {
    servidor.use(handlerMateriais([]))
    abrir()
    expect(await screen.findByText('Nenhum material ainda.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar arquivo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar link' })).toBeInTheDocument()
  })

  it('o envio lista os formatos aceitos e limita o seletor a eles', async () => {
    servidor.use(handlerMateriais([]))
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Enviar arquivo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Enviar arquivo' })
    expect(within(dialogo).getByText('Formatos aceitos: PDF, PPTX, ODP, DOCX ou ODT, até 20 MB.')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Arquivo')).toHaveAttribute('accept', '.pdf,.pptx,.odp,.docx,.odt')
  })

  it('envia o arquivo em multipart com os dados da classe, título e seção', async () => {
    const envio = simularEnvio(201, criarMaterial())
    servidor.use(handlerMateriais([]))
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Enviar arquivo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Enviar arquivo' })
    await usuario.upload(within(dialogo).getByLabelText('Arquivo'), new File(['%PDF-1.4'], 'cartoes.pdf', { type: 'application/pdf' }))
    await usuario.type(within(dialogo).getByLabelText('Título'), 'Cartões')
    await usuario.selectOptions(within(dialogo).getByLabelText('Seção'), SECAO_GERAIS.id)
    await usuario.click(within(dialogo).getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(envio.enviados).toHaveLength(1))
    expect(envio.enviados[0]).toMatchObject({ metodo: 'POST', url: '/api/materiais/arquivo', nomeDoArquivo: 'cartoes.pdf' })
    expect(JSON.parse(envio.enviados[0]?.dados ?? '')).toEqual({ classeId: CLASSE_AMIGO.id, secaoId: SECAO_GERAIS.id, titulo: 'Cartões' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('upload recusado mostra a mensagem da API e mantém o painel aberto', async () => {
    simularEnvio(422, { codigo: 'VALIDACAO', mensagem: 'O arquivo precisa ter até 20 MB.' })
    servidor.use(handlerMateriais([]))
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Enviar arquivo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Enviar arquivo' })
    await usuario.upload(within(dialogo).getByLabelText('Arquivo'), new File(['x'], 'grande.pdf', { type: 'application/pdf' }))
    await usuario.type(within(dialogo).getByLabelText('Título'), 'Grande')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Enviar' }))
    expect(await within(dialogo).findByText('O arquivo precisa ter até 20 MB.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Enviar arquivo' })).toBeInTheDocument()
  })

  it('pede o arquivo e o título antes de enviar', async () => {
    let chamadas = 0
    servidor.use(handlerMateriais([]), http.post('/api/materiais/arquivo', () => { chamadas += 1; return HttpResponse.json(criarMaterial(), { status: 201 }) }))
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Enviar arquivo' }))
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText('Escolha o arquivo.')).toBeInTheDocument()
    expect(chamadas).toBe(0)
  })

  it('adiciona um link https', async () => {
    let corpo: unknown
    servidor.use(
      handlerMateriais([]),
      http.post('/api/materiais/link', async ({ request }) => {
        corpo = await request.json()
        return HttpResponse.json(link, { status: 201 })
      }),
    )
    const usuario = userEvent.setup()
    abrir()
    await usuario.click(await screen.findByRole('button', { name: 'Adicionar link' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Adicionar link' })
    await usuario.type(within(dialogo).getByLabelText('Endereço'), 'https://adventistas.org/x')
    await usuario.type(within(dialogo).getByLabelText('Título'), 'Requisitos')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(corpo).toEqual({ classeId: CLASSE_AMIGO.id, secaoId: null, titulo: 'Requisitos', url: 'https://adventistas.org/x' }))
  })

  it('o título e o botão "Abrir" da linha abrem o material; o menu fica só com as edições', async () => {
    servidor.use(handlerMateriais([pdf]))
    const usuario = userEvent.setup()
    abrir()
    const titulo = await screen.findByRole('link', { name: pdf.titulo })
    expect(titulo).toHaveAttribute('href', pdf.url)
    expect(titulo).toHaveAttribute('target', '_blank')
    const botao = screen.getByRole('link', { name: `Abrir ${pdf.titulo}` })
    expect(botao).toHaveTextContent('Abrir')
    expect(botao).toHaveAttribute('href', pdf.url)
    await usuario.click(screen.getByRole('button', { name: `Opções de ${pdf.titulo}` }))
    const menu = within(screen.getByRole('menu'))
    expect(menu.queryByRole('menuitem', { name: 'Abrir' })).not.toBeInTheDocument()
    expect(menu.getByRole('menuitem', { name: 'Renomear' })).toBeInTheDocument()
  })

  it('menu: renomear e mover de seção gravam pelo PATCH', async () => {
    const corpos: unknown[] = []
    servidor.use(
      handlerMateriais([pdf]),
      http.patch(`/api/materiais/${pdf.id}`, async ({ request }) => {
        corpos.push(await request.json())
        return HttpResponse.json(pdf)
      }),
    )
    abrir()
    let { usuario, menu } = await abrirMenuDe(pdf.titulo)
    await usuario.click(menu.getByRole('menuitem', { name: 'Renomear' }))
    const renomear = await screen.findByRole('dialog', { name: 'Renomear material' })
    const campo = within(renomear).getByLabelText('Título')
    await usuario.clear(campo)
    await usuario.type(campo, 'Cartões novos')
    await usuario.click(within(renomear).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpos).toEqual([{ titulo: 'Cartões novos' }]))
    ;({ usuario, menu } = await abrirMenuDe(pdf.titulo))
    await usuario.click(menu.getByRole('menuitem', { name: 'Mover de seção' }))
    const mover = await screen.findByRole('dialog', { name: 'Mover de seção' })
    await usuario.selectOptions(within(mover).getByLabelText('Seção'), SECAO_GERAIS.id)
    await usuario.click(within(mover).getByRole('button', { name: 'Mover' }))
    await waitFor(() => expect(corpos[1]).toEqual({ secaoId: SECAO_GERAIS.id }))
    expect(SECAO_ESPIRITUAL.id).not.toBe(SECAO_GERAIS.id)
  })

  it('menu: apagar pede confirmação', async () => {
    let apagou = 0
    servidor.use(handlerMateriais([pdf]), http.delete(`/api/materiais/${pdf.id}`, () => { apagou += 1; return new HttpResponse(null, { status: 204 }) }))
    abrir()
    let { usuario, menu } = await abrirMenuDe(pdf.titulo)
    await usuario.click(menu.getByRole('menuitem', { name: 'Apagar' }))
    let dialogo = await screen.findByRole('dialog', { name: 'Apagar material?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(apagou).toBe(0)
    ;({ usuario, menu } = await abrirMenuDe(pdf.titulo))
    await usuario.click(menu.getByRole('menuitem', { name: 'Apagar' }))
    dialogo = await screen.findByRole('dialog', { name: 'Apagar material?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Apagar' }))
    await waitFor(() => expect(apagou).toBe(1))
  })

  it('quem não é autor abre pelo título e não tem menu de opções', async () => {
    servidor.use(handlerMateriais([criarMaterial({ podeEditar: false })]))
    abrir()
    expect(await screen.findByRole('link', { name: pdf.titulo })).toHaveAttribute('href', pdf.url)
    expect(screen.getByRole('link', { name: `Abrir ${pdf.titulo}` })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Opções/ })).not.toBeInTheDocument()
  })

  it('apagar que falha mantém o diálogo aberto com a mensagem; de novo com sucesso, fecha', async () => {
    let falhar = true
    servidor.use(
      handlerMateriais([pdf]),
      http.delete(`/api/materiais/${pdf.id}`, () =>
        falhar ? HttpResponse.json({ codigo: 'CONFLITO', mensagem: 'Só o autor apaga este material.' }, { status: 409 }) : new HttpResponse(null, { status: 204 }),
      ),
    )
    abrir()
    const { usuario, menu } = await abrirMenuDe(pdf.titulo)
    await usuario.click(menu.getByRole('menuitem', { name: 'Apagar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Apagar material?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Apagar' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Só o autor apaga este material.')
    expect(screen.getByRole('dialog', { name: 'Apagar material?' })).toBeInTheDocument()
    falhar = false
    await usuario.click(within(dialogo).getByRole('button', { name: 'Apagar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Apagar material?' })).not.toBeInTheDocument())
  })

  it('mostra o carregando e o erro da API', async () => {
    servidor.use(http.get('/api/classes/:id/materiais', () => HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: 'Classe não encontrada.' }, { status: 404 })))
    abrir()
    expect(screen.getByRole('status', { name: 'Carregando materiais' })).toBeInTheDocument()
    expect(await screen.findByText('Classe não encontrada.')).toBeInTheDocument()
  })

  it('sem conexão diz que precisa de internet e não consulta', async () => {
    estado.modo = 'SEM_CONEXAO'
    let consultas = 0
    servidor.use(http.get('/api/classes/:id/materiais', () => { consultas += 1; return HttpResponse.json([]) }))
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(consultas).toBe(0)
  })

  it('B12: o cache dos materiais sai da memória quando a tela fecha', async () => {
    servidor.use(handlerMateriais([pdf]))
    const { unmount, clienteConsultas } = abrir()
    await screen.findByText(pdf.titulo)
    expect(clienteConsultas.getQueryCache().findAll({ queryKey: ['materiais'] })).toHaveLength(1)
    unmount()
    await waitFor(() => expect(clienteConsultas.getQueryCache().findAll({ queryKey: ['materiais'] })).toHaveLength(0))
  })
})
