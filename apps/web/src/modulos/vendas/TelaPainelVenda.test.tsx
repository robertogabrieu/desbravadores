import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { criarListaDePedidos, criarPainel, criarPedido, criarProdutoDaVenda, criarVenda, handlerPedidos, handlersVendas } from '../../testes/handlers/vendas'
import type { ChamadaDeVenda } from '../../testes/handlers/vendas'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaPainelVenda } from './TelaPainelVenda'

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
const A_PAGAR = criarPedido(3, { comprador: 'Marlene Prado', vendedor: 'Giovana', unidadeNome: 'Tigresas', entrega: true, endereco: 'Rua das Acácias, 120', taxaEntrega: 500 })
const PAGO = criarPedido(2, { comprador: 'Paulo Souza', pago: true, forma: 'PIX' })
const ENTREGUE = criarPedido(4, { comprador: 'Rita Alves', pago: true, forma: 'DINHEIRO', entregueEm: '2026-11-14T13:00:00.000Z' })
const CANCELADO = criarPedido(1, { comprador: 'Ivo Lima', canceladoEm: '2026-10-25T12:00:00.000Z' })

function abrir(dados: Parameters<typeof handlersVendas>[0] = {}, antes: Parameters<typeof servidor.use> = []) {
  servidor.use(
    ...antes,
    ...handlersSessao([criarVinculo('ADM')], undefined, ['venda.gerenciar']),
    ...handlersVendas({ venda: VENDA, pedidos: [A_PAGAR, PAGO, ENTREGUE, CANCELADO], chamadas, ...dados }),
  )
  return renderizarRotas(
    [
      { path: '/adm/vendas', element: <p>Lista de vendas</p> },
      { path: '/adm/vendas/:id', element: <TelaPainelVenda /> },
      { path: '/adm/vendas/:id/editar', element: <p>Editar venda aberto</p> },
      { path: '/adm/vendas/:id/pedidos/novo', element: <p>Lançar pedido aberto</p> },
      { path: '/adm/vendas/:id/pedidos/:pedidoId', element: <p>Resumo aberto</p> },
    ],
    `/adm/vendas/${VENDA.id}`,
  )
}

const linhaDe = async (comprador: string) => within((await screen.findByText(comprador)).closest('tr') as HTMLElement)

describe('Painel da venda: números', () => {
  it('mostra os números que o servidor mandou e os contadores dos filtros', async () => {
    abrir({
      painel: criarPainel({
        porProduto: [
          { produtoId: VENDA.produtos[0]?.id ?? '', nome: 'Lasanha de carne', nomeCurto: 'Carne', unidades: 98 },
          { produtoId: VENDA.produtos[1]?.id ?? '', nome: 'Lasanha de frango', nomeCurto: 'Frango', unidades: 73 },
        ],
        porUnidade: [
          { tipo: 'DIRETORIA', unidadeId: null, nome: 'Diretoria', ativa: true, unidades: 62 },
          { tipo: 'UNIDADE', unidadeId: null, nome: 'Panteras', ativa: false, unidades: 41 },
          { tipo: 'SEM_UNIDADE', unidadeId: null, nome: 'Sem unidade', ativa: true, unidades: 68 },
        ],
      }),
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Lasanhas — 2ª edição' })).toBeInTheDocument()
    expect(await screen.findByText('171')).toBeInTheDocument()
    expect(screen.getByText('98 Carne · 73 Frango')).toBeInTheDocument()
    expect(screen.getByText('R$ 3.930')).toBeInTheDocument()
    expect(screen.getByText('de R$ 4.305 vendidos')).toBeInTheDocument()
    expect(screen.getByText('R$ 375')).toBeInTheDocument()
    expect(screen.getByText('A receber · 3 pedidos')).toBeInTheDocument()
    expect(screen.getByText('31')).toBeInTheDocument()
    expect(screen.getByText('16 já foram')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Todos 47' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'A pagar 3' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'A entregar 31' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Entregues 16' })).toBeInTheDocument()
    const unidades = screen.getByRole('region', { name: 'Unidades vendidas por unidade' })
    expect(within(unidades).getByText('Panteras (inativa)')).toBeInTheDocument()
    expect(within(unidades).getByText('Sem unidade')).toBeInTheDocument()
    expect(within(unidades).getByText('Total: 171 unidades')).toBeInTheDocument()
  })

  it('Lançar pedido é o destaque e leva ao formulário; Editar venda leva à edição', async () => {
    const { roteador } = abrir()
    const usuario = userEvent.setup()
    expect(await screen.findByRole('link', { name: 'Editar venda' })).toHaveAttribute('href', `/adm/vendas/${VENDA.id}/editar`)
    await usuario.click(await screen.findByRole('link', { name: 'Lançar pedido' }))
    expect(roteador.state.location.pathname).toBe(`/adm/vendas/${VENDA.id}/pedidos/novo`)
  })

  it('encerrar a venda pede confirmação e chama a API', async () => {
    abrir()
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Encerrar venda' }))
    expect(chamadas).toHaveLength(0)
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Encerrar venda' }))
    await waitFor(() => expect(chamadas.map((chamada) => chamada.caminho)).toEqual([`/api/vendas/${VENDA.id}/encerrar`]))
  })
})

describe('Painel da venda: tabela e ações', () => {
  it('mostra pagamento, situação e a etiqueta Cancelado; o comprador leva ao resumo', async () => {
    const { roteador } = abrir()
    const usuario = userEvent.setup()
    const aPagar = await linhaDe('Marlene Prado')
    expect(aPagar.getByText('A pagar')).toBeInTheDocument()
    expect(aPagar.getByText('A entregar')).toBeInTheDocument()
    expect(aPagar.getByText(/Entrega · Rua das Acácias, 120/)).toBeInTheDocument()
    expect(aPagar.getByText('R$ 55,00')).toBeInTheDocument()
    const retirada = await linhaDe('Paulo Souza')
    expect(retirada.getByText('Pago · Pix')).toBeInTheDocument()
    expect(retirada.getByText('A retirar')).toBeInTheDocument()
    expect(retirada.getByRole('button', { name: 'Marcar como retirado, pedido 2' })).toBeInTheDocument()
    expect(retirada.queryByRole('button', { name: /Marcar como entregue/ })).not.toBeInTheDocument()
    expect((await linhaDe('Ivo Lima')).getByText('Cancelado')).toBeInTheDocument()
    await usuario.click(screen.getByRole('link', { name: 'Marlene Prado' }))
    expect(roteador.state.location.pathname).toBe(`/adm/vendas/${VENDA.id}/pedidos/${A_PAGAR.id}`)
  })

  it('marcar como pago pede a forma entre as da venda mais Misto, e só confirma com uma escolhida', async () => {
    abrir()
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Marcar como pago, pedido 3' }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getAllByRole('radio').map((opcao) => opcao.parentElement?.textContent)).toEqual(['Pix', 'Dinheiro', 'Misto'])
    const confirmar = within(dialogo).getByRole('button', { name: 'Marcar como pago' })
    expect(confirmar).toBeDisabled()
    await usuario.click(within(dialogo).getByRole('radio', { name: 'Pix' }))
    await usuario.click(confirmar)
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0]).toMatchObject({ metodo: 'POST', caminho: `/api/vendas/${VENDA.id}/pedidos/${A_PAGAR.id}/pagar`, corpo: { forma: 'PIX' } })
  })

  it('pedido pago desmarca o pago; pedido a pagar marca entregue sem diálogo', async () => {
    abrir()
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Desmarcar pago, pedido 2' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0]?.caminho).toBe(`/api/vendas/${VENDA.id}/pedidos/${PAGO.id}/despagar`)
    await usuario.click(screen.getByRole('button', { name: 'Marcar como entregue, pedido 3' }))
    await waitFor(() => expect(chamadas).toHaveLength(2))
    expect(chamadas[1]?.caminho).toBe(`/api/vendas/${VENDA.id}/pedidos/${A_PAGAR.id}/entregar`)
  })

  it('pedido entregue desmarca a entrega e não oferece Cancelar', async () => {
    abrir()
    const usuario = userEvent.setup()
    const linha = await linhaDe('Rita Alves')
    expect(linha.queryByRole('button', { name: /Cancelar/ })).not.toBeInTheDocument()
    expect(linha.getByText('Retirado')).toBeInTheDocument()
    await usuario.click(linha.getByRole('button', { name: 'Desmarcar retirada, pedido 4' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0]?.caminho).toBe(`/api/vendas/${VENDA.id}/pedidos/${ENTREGUE.id}/desentregar`)
  })

  it('cancelar pede confirmação com o número e o comprador', async () => {
    abrir()
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Cancelar, pedido 3' }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByText(/Marlene Prado/)).toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Voltar' }))
    expect(chamadas).toHaveLength(0)
    await usuario.click(screen.getByRole('button', { name: 'Cancelar, pedido 3' }))
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar pedido' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0]?.caminho).toBe(`/api/vendas/${VENDA.id}/pedidos/${A_PAGAR.id}/cancelar`)
  })

  it('pedido cancelado só oferece Reativar', async () => {
    abrir()
    const usuario = userEvent.setup()
    const linha = await linhaDe('Ivo Lima')
    expect(linha.queryByRole('button', { name: /pago|entreg|Cancelar/ })).not.toBeInTheDocument()
    await usuario.click(linha.getByRole('button', { name: 'Reativar pedido 1' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0]?.caminho).toBe(`/api/vendas/${VENDA.id}/pedidos/${CANCELADO.id}/reativar`)
  })

  it('mostra a recusa da API em vez de engolir o erro', async () => {
    abrir()
    const usuario = userEvent.setup()
    servidor.use(http.post('/api/vendas/:id/pedidos/:pedidoId/entregar', () => HttpResponse.json({ codigo: 'CONFLITO', mensagem: 'Esta venda foi encerrada.' }, { status: 409 })))
    await usuario.click(await screen.findByRole('button', { name: 'Marcar como entregue, pedido 3' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta venda foi encerrada.')
  })

  it('sem conexão as ações de escrita ficam desligadas e dizem o motivo', async () => {
    estado.modo = 'SEM_CONEXAO'
    abrir()
    expect(await screen.findByRole('button', { name: 'Marcar como pago, pedido 3' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar, pedido 3' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Encerrar venda' })).toBeDisabled()
    expect(screen.getAllByText(/precisam de internet/).length).toBeGreaterThan(0)
  })
})

describe('Painel da venda: filtros, busca e vazios', () => {
  it('trocar o filtro e buscar consultam o servidor; trocar de filtro volta à página 1', async () => {
    const consultas: URLSearchParams[] = []
    abrir({}, [handlerPedidos(() => criarListaDePedidos([A_PAGAR], { total: 45 }), consultas)])
    const usuario = userEvent.setup()
    await screen.findByText('Marlene Prado')
    await usuario.click(screen.getByRole('button', { name: 'Próxima página' }))
    await waitFor(() => expect(consultas.at(-1)?.get('pagina')).toBe('2'))
    await usuario.click(screen.getByRole('tab', { name: 'A pagar 3' }))
    await waitFor(() => expect(consultas.at(-1)?.get('filtro')).toBe('A_PAGAR'))
    expect(consultas.at(-1)?.get('pagina')).toBe('1')
    await usuario.type(screen.getByRole('searchbox', { name: 'Buscar comprador ou nº' }), 'mar')
    await waitFor(() => expect(consultas.at(-1)?.get('busca')).toBe('mar'))
  })

  it('a última página esvaziou: volta à última que ainda tem pedido, sem dizer que tudo está pago', async () => {
    const consultas: URLSearchParams[] = []
    const resposta = () => (consultas.at(-1)?.get('pagina') === '2' ? criarListaDePedidos([], { total: 20, pagina: 2 }) : criarListaDePedidos([A_PAGAR], { total: 21 }))
    abrir({}, [handlerPedidos(resposta, consultas)])
    const usuario = userEvent.setup()
    await screen.findByText('Marlene Prado')
    await usuario.click(screen.getByRole('button', { name: 'Próxima página' }))
    await waitFor(() => expect(consultas.some((consulta) => consulta.get('pagina') === '2')).toBe(true))
    await waitFor(() => expect(consultas.at(-1)?.get('pagina')).toBe('1'))
    expect(await screen.findByText('Marlene Prado')).toBeInTheDocument()
    expect(screen.queryByText(/estão pagos/)).not.toBeInTheDocument()
  })

  it('em "A pagar", página 2 esvaziada: mostra carregando, sem a mensagem falsa nem o rodapé, até a página 1 chegar', async () => {
    abrir()
    const consultas: URLSearchParams[] = []
    servidor.use(
      http.get('/api/vendas/:id/pedidos', async ({ request }) => {
        const consulta = new URL(request.url).searchParams
        consultas.push(consulta)
        if (consulta.get('pagina') === '2') return HttpResponse.json(criarListaDePedidos([], { total: 20, pagina: 2 }))
        if (consultas.length > 2) await delay(400)
        return HttpResponse.json(criarListaDePedidos([A_PAGAR], { total: 21 }))
      }),
    )
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: 'A pagar 3' }))
    await screen.findByText('Marlene Prado')
    await usuario.click(screen.getByRole('button', { name: 'Próxima página' }))
    await screen.findByRole('status', { name: 'Carregando os pedidos' })
    expect(screen.queryByText(/estão pagos/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Mostrando 0 de/)).not.toBeInTheDocument()
    expect(await screen.findByText('Marlene Prado')).toBeInTheDocument()
  })

  it('filtro sem resultado oferece ver todos', async () => {
    abrir()
    servidor.use(handlerPedidos(() => criarListaDePedidos([])))
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('tab', { name: 'A pagar 3' }))
    expect(await screen.findByText('Nenhum pedido a pagar.')).toBeInTheDocument()
    servidor.use(handlerPedidos(() => criarListaDePedidos([A_PAGAR])))
    await usuario.click(screen.getByRole('button', { name: 'Ver todos os pedidos' }))
    expect(await screen.findByText('Marlene Prado')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Todos 47' })).toHaveAttribute('aria-selected', 'true')
  })

  it('sem nenhum pedido, oferece Lançar pedido', async () => {
    abrir({ pedidos: [], painel: criarPainel({ unidadesVendidas: 0, porProduto: [], vendido: 0, recebido: 0, aReceber: 0, pedidosAPagar: 0, aEntregar: 0, entregues: 0, contadores: { todos: 0, aPagar: 0, aEntregar: 0, entregues: 0 } }) })
    expect(await screen.findByText('Nenhum pedido lançado.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Lançar pedido' }).length).toBeGreaterThan(0)
  })

  it('venda sem produto ativo desliga Lançar pedido e diz o caminho', async () => {
    abrir({ venda: criarVenda(1, { produtos: [criarProdutoDaVenda(1, { ativo: false })] }) })
    expect(await screen.findByText(/Falta cadastrar os produtos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lançar pedido' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'Lançar pedido' })).not.toBeInTheDocument()
  })
})

describe('Painel da venda encerrada', () => {
  it('não tem ação de escrita, desliga Lançar com o motivo e mantém o resumo', async () => {
    abrir({ venda: criarVenda(1, { nome: 'Lasanhas — 2ª edição', encerradaEm: '2026-11-15T12:00:00.000Z' }) })
    const linha = await linhaDe('Marlene Prado')
    expect(linha.queryByRole('button')).not.toBeInTheDocument()
    expect(linha.getByRole('link', { name: 'Resumo, pedido 3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lançar pedido' })).toBeDisabled()
    expect(screen.getByText(/Esta venda foi encerrada/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Encerrar venda' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Editar venda' })).not.toBeInTheDocument()
  })

  it('Reabrir venda chama a API', async () => {
    abrir({ venda: criarVenda(1, { encerradaEm: '2026-11-15T12:00:00.000Z' }) })
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Reabrir venda' }))
    await waitFor(() => expect(chamadas.map((chamada) => chamada.caminho)).toEqual([`/api/vendas/${VENDA.id}/reabrir`]))
  })
})
