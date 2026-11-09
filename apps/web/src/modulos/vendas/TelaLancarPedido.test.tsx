import { totalDoPedido } from '@desbravadores/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { escolherOpcao } from '../../testes/escolherOpcao'
import { criarUnidade, handlerUnidades } from '../../testes/handlers/leitura'
import { criarFormaPix, criarFormaSeteMe, criarPedido, criarVenda, handlerPedido, handlerVenda, handlersEscritaVendas } from '../../testes/handlers/vendas'
import type { ChamadaDeVenda } from '../../testes/handlers/vendas'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { formatarReais } from './formatos'
import { TelaLancarPedido } from './TelaLancarPedido'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

let chamadas: ChamadaDeVenda[] = []

beforeEach(() => {
  estado.modo = 'ONLINE'
  chamadas = []
})

const VENDA = criarVenda(1, { nome: 'Lasanhas — 2ª edição' })
const CARNE = VENDA.produtos[0]?.id ?? ''
const FRANGO = VENDA.produtos[1]?.id ?? ''
const TIGRESAS = criarUnidade({ id: '00000000-0000-7000-8000-000000000301', nome: 'Tigresas' })

function abrir(rota: 'novo' | { editar: ReturnType<typeof criarPedido> }, venda = VENDA, antes: Parameters<typeof servidor.use> = []) {
  const pedido = rota === 'novo' ? criarPedido(48) : rota.editar
  servidor.use(
    ...antes,
    ...handlersSessao([criarVinculo('ADM')], undefined, ['venda.gerenciar']),
    handlerVenda(() => venda),
    handlerPedido(() => pedido),
    handlerUnidades([TIGRESAS]),
    ...handlersEscritaVendas(chamadas, { venda, pedido }),
  )
  return renderizarRotas(
    [
      { path: '/adm/vendas/:id', element: <p>Painel da venda aberto</p> },
      { path: '/adm/vendas/:id/pedidos/novo', element: <TelaLancarPedido /> },
      { path: '/adm/vendas/:id/pedidos/:pedidoId', element: <p>Resumo aberto</p> },
      { path: '/adm/vendas/:id/pedidos/:pedidoId/editar', element: <TelaLancarPedido /> },
    ],
    rota === 'novo' ? `/adm/vendas/${venda.id}/pedidos/novo` : `/adm/vendas/${venda.id}/pedidos/${rota.editar.id}/editar`,
  )
}

const total = () => within(screen.getByRole('complementary', { name: 'Resumo do pedido' })).getByLabelText('Total do pedido')

describe('Lançar pedido', () => {
  it('abre com o título, o Voltar e todos os campos na ordem da conversa', async () => {
    abrir('novo')
    expect(await screen.findByRole('heading', { level: 1, name: 'Lançar pedido' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Comprador')).toBeInTheDocument()
    for (const rotulo of ['Vendedor', 'Unidade do vendedor', 'Observação']) expect(screen.getByLabelText(rotulo)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aumentar 1 Carne' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aumentar 1 Frango' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Endereço da entrega')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Pix' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', `/adm/vendas/${VENDA.id}`)
    expect(screen.queryByRole('link', { name: 'Cancelar' })).not.toBeInTheDocument()
  })

  it('o total ao vivo bate com totalDoPedido, na retirada e na entrega', async () => {
    abrir('novo')
    const usuario = userEvent.setup()
    await screen.findByLabelText('Comprador')
    const carne = screen.getByRole('button', { name: 'Aumentar 1 Carne' })
    await usuario.click(carne)
    await usuario.click(carne)
    await usuario.click(screen.getByRole('button', { name: 'Aumentar 1 Frango' }))
    const itens = [{ quantidade: 2, precoGravado: 2500 }, { quantidade: 1, precoGravado: 2500 }]
    expect(total()).toHaveTextContent(formatarReais(totalDoPedido(itens, 0)))
    expect(total()).toHaveTextContent('R$ 75,00')

    await usuario.click(screen.getByRole('radio', { name: 'Entrega +R$ 5' }))
    expect(total()).toHaveTextContent(formatarReais(totalDoPedido(itens, 500)))
    expect(total()).toHaveTextContent('R$ 80,00')
    expect(screen.getByLabelText('Endereço da entrega')).toBeInTheDocument()

    await usuario.click(screen.getByRole('radio', { name: 'Retirada' }))
    expect(total()).toHaveTextContent('R$ 75,00')
    expect(screen.queryByLabelText('Endereço da entrega')).not.toBeInTheDocument()
  })

  it('grava o pedido de entrega, com unidade, e vai para o resumo', async () => {
    const { roteador } = abrir('novo')
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText('Comprador'), 'Marlene Prado')
    await usuario.type(screen.getByLabelText('Vendedor'), 'Giovana')
    await escolherOpcao(usuario, screen.getByLabelText('Unidade do vendedor'), TIGRESAS.id)
    await usuario.click(screen.getByRole('button', { name: 'Aumentar 1 Carne' }))
    await usuario.click(screen.getByRole('radio', { name: 'Entrega +R$ 5' }))
    await usuario.type(screen.getByLabelText('Endereço da entrega'), 'Rua das Acácias, 120')
    await usuario.click(screen.getByRole('button', { name: 'Salvar e ver resumo' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0]).toMatchObject({
      metodo: 'POST',
      caminho: `/api/vendas/${VENDA.id}/pedidos`,
      corpo: { comprador: 'Marlene Prado', vendedor: 'Giovana', unidadeId: TIGRESAS.id, daDiretoria: false, entrega: true, endereco: 'Rua das Acácias, 120', pago: false, forma: null, itens: [{ produtoId: CARNE, quantidade: 1 }] },
    })
    await waitFor(() => expect(roteador.state.location.pathname).toMatch(/\/pedidos\/[^/]+$/))
  })

  it('Diretoria vai como daDiretoria, sem unidade', async () => {
    abrir('novo')
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText('Comprador'), 'Ana')
    await escolherOpcao(usuario, screen.getByLabelText('Unidade do vendedor'), 'Diretoria')
    await usuario.click(screen.getByRole('button', { name: 'Aumentar 1 Frango' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar e ver resumo' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0]?.corpo).toMatchObject({ daDiretoria: true, unidadeId: null, itens: [{ produtoId: FRANGO, quantidade: 1 }] })
  })

  it('lançar já pago exige a forma, entre as da venda mais Misto, antes de chamar a API', async () => {
    abrir('novo', criarVenda(1, { formas: [criarFormaPix(), criarFormaSeteMe({ ativo: false })] }))
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText('Comprador'), 'Ana')
    await usuario.click(screen.getByRole('button', { name: 'Aumentar 1 Carne' }))
    await usuario.click(screen.getByRole('radio', { name: 'Pago' }))
    const forma = screen.getByRole('group', { name: 'Forma de pagamento' })
    expect(within(forma).getAllByRole('radio').map((opcao) => opcao.parentElement?.textContent)).toEqual(['Pix', 'Misto'])
    await usuario.click(screen.getByRole('button', { name: 'Salvar e ver resumo' }))
    expect(await screen.findByText('Escolha a forma de pagamento.')).toBeInTheDocument()
    expect(chamadas).toHaveLength(0)
    await usuario.click(within(forma).getByRole('radio', { name: 'Misto' }))
    expect(within(screen.getByRole('complementary', { name: 'Resumo do pedido' })).getByText('Pago · Misto')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Salvar e ver resumo' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0]?.corpo).toMatchObject({ pago: true, forma: 'MISTO' })
  })

  it('recusa nome, itens e endereço faltando junto do campo, sem chamar a API', async () => {
    abrir('novo')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('radio', { name: 'Entrega +R$ 5' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar e ver resumo' }))
    expect(await screen.findByText('Informe o nome de quem comprou')).toBeInTheDocument()
    expect(screen.getByText('Escolha ao menos uma unidade.')).toBeInTheDocument()
    expect(screen.getByText('Informe o endereço da entrega.')).toBeInTheDocument()
    expect(chamadas).toHaveLength(0)
  })

  it('mostra a recusa da API na tela e mantém o que foi digitado', async () => {
    abrir('novo')
    servidor.use(http.post('/api/vendas/:id/pedidos', () => HttpResponse.json({ codigo: 'CONFLITO', mensagem: 'Esta venda foi encerrada.' }, { status: 409 })))
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText('Comprador'), 'Ana')
    await usuario.click(screen.getByRole('button', { name: 'Aumentar 1 Carne' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar e ver resumo' }))
    expect(await screen.findByText('Esta venda foi encerrada.')).toBeInTheDocument()
    expect(screen.getByLabelText('Comprador')).toHaveValue('Ana')
  })

  it('erro de campo da API (400) cai no campo', async () => {
    abrir('novo')
    servidor.use(http.post('/api/vendas/:id/pedidos', () => HttpResponse.json({ codigo: 'VALIDACAO', mensagem: 'Dados inválidos', campos: { comprador: 'Nome longo demais' } }, { status: 400 })))
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText('Comprador'), 'Ana')
    await usuario.click(screen.getByRole('button', { name: 'Aumentar 1 Carne' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar e ver resumo' }))
    expect(await screen.findByText('Nome longo demais')).toBeInTheDocument()
  })

  it('sem conexão o botão de salvar fica desligado e diz o motivo', async () => {
    estado.modo = 'SEM_CONEXAO'
    abrir('novo')
    expect(await screen.findByRole('button', { name: 'Salvar e ver resumo' })).toBeDisabled()
    expect(screen.getByText('Salvar o pedido precisa de internet. Conecte-se para continuar.')).toBeInTheDocument()
  })

  it('venda encerrada não deixa lançar', async () => {
    abrir('novo', criarVenda(1, { encerradaEm: '2026-11-15T12:00:00.000Z' }))
    expect(await screen.findByText('Esta venda foi encerrada.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Comprador')).not.toBeInTheDocument()
  })
})

describe('Editar pedido', () => {
  const PEDIDO = criarPedido(7, {
    comprador: 'Marlene Prado',
    observacao: 'sem queijo',
    itens: [{ produtoId: CARNE, nome: 'Lasanha de carne', nomeCurto: 'Carne', quantidade: 2, precoGravado: 2000 }],
  })

  it('carrega o pedido, mantém o preço gravado no total e não mostra pago nem forma', async () => {
    abrir({ editar: PEDIDO })
    expect(await screen.findByRole('heading', { level: 1, name: 'Editar pedido' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Comprador')).toHaveValue('Marlene Prado'))
    expect(screen.getByLabelText('Observação')).toHaveValue('sem queijo')
    expect(total()).toHaveTextContent('R$ 40,00')
    expect(screen.queryByRole('radio', { name: 'Pago' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Forma de pagamento' })).not.toBeInTheDocument()

    const usuario = userEvent.setup()
    await usuario.click(screen.getByRole('button', { name: 'Aumentar 1 Frango' }))
    expect(total()).toHaveTextContent('R$ 65,00')
  })

  it('item que voltou de zero entra no total com o preço de agora, como a API grava', async () => {
    const zerado = criarPedido(8, {
      comprador: 'Marlene Prado',
      itens: [{ produtoId: FRANGO, nome: 'Frango assado', nomeCurto: 'Frango', quantidade: 0, precoGravado: 1000 }],
    })
    abrir({ editar: zerado })
    const usuario = userEvent.setup()
    await waitFor(() => expect(screen.getByLabelText('Comprador')).toHaveValue('Marlene Prado'))
    await usuario.click(screen.getByRole('button', { name: 'Aumentar 1 Frango' }))
    expect(total()).toHaveTextContent(formatarReais(totalDoPedido([{ quantidade: 1, precoGravado: 2500 }], 0)))
  })

  it('salva por PATCH sem pago nem forma', async () => {
    abrir({ editar: PEDIDO })
    const usuario = userEvent.setup()
    await waitFor(() => expect(screen.getByLabelText('Comprador')).toHaveValue('Marlene Prado'))
    await usuario.type(screen.getByLabelText('Vendedor'), 'Giovana')
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0]).toMatchObject({ metodo: 'PATCH', caminho: `/api/vendas/${VENDA.id}/pedidos/${PEDIDO.id}`, corpo: { vendedor: 'Giovana', itens: [{ produtoId: CARNE, quantidade: 2 }] } })
    expect(chamadas[0]?.corpo).not.toHaveProperty('pago')
    expect(chamadas[0]?.corpo).not.toHaveProperty('forma')
  })

  it('pedido pago desliga itens e entrega com o motivo, mas deixa mudar o contato', async () => {
    abrir({ editar: criarPedido(7, { ...PEDIDO, pago: true, forma: 'PIX' }) })
    await waitFor(() => expect(screen.getByLabelText('Comprador')).toHaveValue('Marlene Prado'))
    expect(screen.getAllByText('Pedido já pago. Desmarque o pagamento para mudar o valor.')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Aumentar 1 Carne' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Retirada' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Entrega +R$ 5' })).toBeDisabled()
    expect(screen.getByLabelText('Vendedor')).toBeEnabled()
    expect(total()).toHaveTextContent('R$ 40,00')
  })

  it('pedido que não existe mostra o estado de não encontrado', async () => {
    abrir({ editar: PEDIDO }, VENDA, [handlerPedido(() => ({ status: 404, codigo: 'NAO_ENCONTRADO', mensagem: 'Pedido não encontrado' }))])
    expect(await screen.findByText('Não encontramos o pedido')).toBeInTheDocument()
  })
})
