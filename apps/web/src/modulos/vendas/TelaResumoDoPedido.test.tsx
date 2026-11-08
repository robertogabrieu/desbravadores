import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { criarPedido, criarVenda, handlersVendas } from '../../testes/handlers/vendas'
import type { ChamadaDeVenda } from '../../testes/handlers/vendas'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaResumoDoPedido } from './TelaResumoDoPedido'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))
const desenho = vi.hoisted(() => ({ desenharImagem: vi.fn() }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

vi.mock('./imagem/desenharImagem', () => desenho)

let chamadas: ChamadaDeVenda[] = []

beforeEach(() => {
  estado.modo = 'ONLINE'
  chamadas = []
  desenho.desenharImagem.mockReset()
  desenho.desenharImagem.mockImplementation(() => Promise.resolve(new Blob(['png'], { type: 'image/png' })))
  URL.createObjectURL = vi.fn(() => 'blob:imagem-do-pedido')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'canShare')
  Reflect.deleteProperty(navigator, 'share')
  vi.restoreAllMocks()
})

const VENDA = criarVenda(1, { nome: 'Lasanhas — 2ª edição' })
const A_PAGAR = criarPedido(3, { comprador: 'Marlene Prado' })
const ENTREGA = criarPedido(3, { comprador: 'Marlene Prado', entrega: true, endereco: 'Rua das Acácias, 120', taxaEntrega: 500 })
const PAGO = criarPedido(3, { comprador: 'Marlene Prado', pago: true, forma: 'PIX' })
const ENTREGUE = criarPedido(3, { comprador: 'Marlene Prado', pago: true, forma: 'DINHEIRO', entregueEm: '2026-11-14T13:00:00.000Z' })
const CANCELADO = criarPedido(3, { comprador: 'Marlene Prado', canceladoEm: '2026-10-25T12:00:00.000Z' })

function abrir(pedido = A_PAGAR, venda = VENDA, antes: Parameters<typeof servidor.use> = []) {
  servidor.use(...antes, ...handlersSessao([criarVinculo('ADM')], undefined, ['venda.gerenciar']), ...handlersVendas({ venda, pedidos: [pedido], pedido, chamadas }))
  return renderizarRotas(
    [
      { path: '/adm/vendas/:id', element: <p>Painel aberto</p> },
      { path: '/adm/vendas/:id/pedidos/:pedidoId', element: <TelaResumoDoPedido /> },
      { path: '/adm/vendas/:id/pedidos/:pedidoId/editar', element: <p>Editar pedido aberto</p> },
    ],
    `/adm/vendas/${venda.id}/pedidos/${pedido.id}`,
  )
}

const botao = (nome: string | RegExp) => screen.findByRole('button', { name: nome })
const semBotao = (nome: string | RegExp) => expect(screen.queryByRole('button', { name: nome })).not.toBeInTheDocument()

function permitirCompartilhar(aceita: boolean) {
  const share = vi.fn(() => Promise.resolve())
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => aceita })
  Object.defineProperty(navigator, 'share', { configurable: true, value: share })
  return share
}

describe('Resumo do pedido: imagem e envio', () => {
  it('mostra o título, a imagem gerada e o conteúdo do pedido pendente com "Como pagar"', async () => {
    abrir()
    expect(await screen.findByRole('heading', { level: 1, name: 'Pedido nº 3' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /Resumo do pedido nº 3/ })).toHaveAttribute('src', 'blob:imagem-do-pedido')
    const blocos = desenho.desenharImagem.mock.calls[0]?.[0] as { id: string }[]
    expect(blocos.map((bloco) => bloco.id)).toContain('pagar')
  })

  it('mostra o instante do lançamento no fuso do clube e passa o nome do clube à imagem', async () => {
    abrir()
    expect(await screen.findByText(/Marlene Prado · lançado em 21\/10 às 09h00/)).toBeInTheDocument()
    await screen.findByRole('img', { name: /Resumo do pedido nº 3/ })
    expect(JSON.stringify(desenho.desenharImagem.mock.calls[0]?.[0])).toContain('Clube Teste')
  })

  it('pedido pago gera a imagem sem "Como pagar"', async () => {
    abrir(PAGO)
    await screen.findByRole('img', { name: /Resumo do pedido nº 3/ })
    const blocos = desenho.desenharImagem.mock.calls[0]?.[0] as { id: string }[]
    expect(blocos.map((bloco) => bloco.id)).not.toContain('pagar')
  })

  it('Baixar fica desligado até a imagem ficar pronta e então entrega pedido-<n>-<comprador>.png', async () => {
    let pronta: (blob: Blob) => void = () => undefined
    desenho.desenharImagem.mockImplementation(() => new Promise<Blob>((resolver) => (pronta = resolver)))
    const baixados: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      baixados.push(this.download)
    })
    abrir()
    expect(await botao('Baixar imagem')).toBeDisabled()
    pronta(new Blob(['png'], { type: 'image/png' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Baixar imagem' })).toBeEnabled())
    await userEvent.setup().click(screen.getByRole('button', { name: 'Baixar imagem' }))
    expect(baixados).toEqual(['pedido-3-marlene-prado.png'])
  })

  it('se o desenho falhar, avisa e deixa tentar de novo', async () => {
    desenho.desenharImagem.mockImplementationOnce(() => Promise.reject(new Error('sem canvas')))
    abrir()
    expect(await screen.findByText('Não foi possível preparar a imagem.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('img', { name: /Resumo do pedido nº 3/ })).toBeInTheDocument()
  })

  it('Compartilhar só aparece quando o aparelho aceita o arquivo, e abre o menu do aparelho', async () => {
    const share = permitirCompartilhar(true)
    abrir()
    const compartilhar = await botao('Compartilhar')
    await waitFor(() => expect(compartilhar).toBeEnabled())
    await userEvent.setup().click(compartilhar)
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pedido nº 3', files: [expect.any(File)] }))
  })

  it('sem suporte a compartilhar, só Baixar e a nota manda baixar', async () => {
    permitirCompartilhar(false)
    abrir()
    await botao('Baixar imagem')
    semBotao('Compartilhar')
    expect(screen.getByText(/Baixe a imagem/)).toBeInTheDocument()
  })
})

describe('Resumo do pedido: situação e ações', () => {
  it('pendente de retirada oferece marcar pago, marcar retirado, editar e cancelar', async () => {
    abrir()
    await botao('Marcar como pago')
    expect(screen.getByText('A pagar')).toBeInTheDocument()
    expect(screen.getByText('A retirar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marcar como retirado' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar pedido' })).toHaveAttribute('href', `/adm/vendas/${VENDA.id}/pedidos/${A_PAGAR.id}/editar`)
    expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument()
  })

  it('pedido de entrega fala em entregue', async () => {
    abrir(ENTREGA)
    await botao('Marcar como entregue')
    expect(screen.getByText('A entregar')).toBeInTheDocument()
  })

  it('Marcar como pago pergunta a forma entre as da venda e grava', async () => {
    abrir()
    const usuario = userEvent.setup()
    await usuario.click(await botao('Marcar como pago'))
    const dialogo = screen.getByRole('dialog')
    await usuario.click(within(dialogo).getByRole('radio', { name: 'Pix' }))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Marcar como pago' }))
    await waitFor(() => expect(chamadas).toContainEqual(expect.objectContaining({ caminho: `/api/vendas/${VENDA.id}/pedidos/${A_PAGAR.id}/pagar`, corpo: { forma: 'PIX' } })))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('pedido pago mostra "Pago · forma", desmarca o pago e continua editável', async () => {
    abrir(PAGO)
    const usuario = userEvent.setup()
    expect(await screen.findByText('Pago · Pix')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar pedido' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Desmarcar pago' }))
    await waitFor(() => expect(chamadas.map((chamada) => chamada.caminho)).toContain(`/api/vendas/${VENDA.id}/pedidos/${PAGO.id}/despagar`))
  })

  it('marca como retirado', async () => {
    abrir()
    await userEvent.setup().click(await botao('Marcar como retirado'))
    await waitFor(() => expect(chamadas.map((chamada) => chamada.caminho)).toContain(`/api/vendas/${VENDA.id}/pedidos/${A_PAGAR.id}/entregar`))
  })

  it('pedido entregue desmarca a entrega e não oferece Cancelar', async () => {
    abrir(ENTREGUE)
    const usuario = userEvent.setup()
    expect(await screen.findByText('Retirado')).toBeInTheDocument()
    semBotao('Cancelar pedido')
    await usuario.click(screen.getByRole('button', { name: 'Desmarcar retirada' }))
    await waitFor(() => expect(chamadas.map((chamada) => chamada.caminho)).toContain(`/api/vendas/${VENDA.id}/pedidos/${ENTREGUE.id}/desentregar`))
  })

  it('Cancelar pedido confirma no diálogo e grava', async () => {
    abrir()
    const usuario = userEvent.setup()
    await usuario.click(await botao('Cancelar pedido'))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByText(/Marlene Prado/)).toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar pedido' }))
    await waitFor(() => expect(chamadas.map((chamada) => chamada.caminho)).toContain(`/api/vendas/${VENDA.id}/pedidos/${A_PAGAR.id}/cancelar`))
  })

  it('pedido cancelado mostra a etiqueta e só oferece Reativar', async () => {
    abrir(CANCELADO)
    const usuario = userEvent.setup()
    const reativar = await botao('Reativar pedido')
    expect(screen.getAllByText('Cancelado').length).toBeGreaterThan(0)
    semBotao('Marcar como pago')
    semBotao('Marcar como retirado')
    semBotao('Cancelar pedido')
    expect(screen.queryByRole('link', { name: 'Editar pedido' })).not.toBeInTheDocument()
    await usuario.click(reativar)
    await waitFor(() => expect(chamadas.map((chamada) => chamada.caminho)).toContain(`/api/vendas/${VENDA.id}/pedidos/${CANCELADO.id}/reativar`))
  })

  it('venda encerrada mantém a imagem e o Baixar e tira as ações de escrita, dizendo o motivo', async () => {
    abrir(A_PAGAR, criarVenda(1, { encerradaEm: '2026-11-20T12:00:00.000Z' }))
    await botao('Baixar imagem')
    semBotao('Marcar como pago')
    semBotao('Marcar como retirado')
    semBotao('Cancelar pedido')
    expect(screen.queryByRole('link', { name: 'Editar pedido' })).not.toBeInTheDocument()
    expect(screen.getByText(/venda foi encerrada/)).toBeInTheDocument()
  })

  it('a recusa da API aparece na tela', async () => {
    abrir(A_PAGAR, VENDA, [http.post('/api/vendas/:id/pedidos/:pedidoId/entregar', () => HttpResponse.json({ codigo: 'CONFLITO', mensagem: 'Esta venda foi encerrada. Reabra para alterar.' }, { status: 409 }))])
    await userEvent.setup().click(await botao('Marcar como retirado'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta venda foi encerrada. Reabra para alterar.')
  })

  it('sem conexão as ações de escrita ficam desligadas e dizem o motivo, mas Baixar continua', async () => {
    estado.modo = 'SEM_CONEXAO'
    abrir()
    expect(await botao('Marcar como pago')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Marcar como retirado' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeDisabled()
    expect(screen.getByText(/precisam de internet/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Baixar imagem' })).toBeEnabled())
  })
})

describe('Resumo do pedido: estados da tela', () => {
  it('mostra o carregando antes dos dados', () => {
    abrir()
    expect(screen.getByRole('status', { name: 'Carregando o pedido' })).toBeInTheDocument()
  })

  it('pedido que não existe mostra "não encontrado" com a saída', async () => {
    abrir(A_PAGAR, VENDA, [http.get('/api/vendas/:id/pedidos/:pedidoId', () => HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: 'Pedido não encontrado.' }, { status: 404 }))])
    expect(await screen.findByText('Não encontramos o pedido')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver a venda' })).toHaveAttribute('href', `/adm/vendas/${VENDA.id}`)
  })

  it('falha de leitura mostra o erro e deixa tentar de novo', async () => {
    abrir(A_PAGAR, VENDA, [http.get('/api/vendas/:id/pedidos/:pedidoId', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falhou agora.' }, { status: 500 }))])
    expect(await screen.findByText('Falhou agora.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })
})
