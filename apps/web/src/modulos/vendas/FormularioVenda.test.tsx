import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { criarFormaDinheiro, criarFormaPix, criarFormaSeteMe, criarProdutoDaVenda, criarVenda, handlerVenda, handlersEscritaVendas } from '../../testes/handlers/vendas'
import type { ChamadaDeVenda } from '../../testes/handlers/vendas'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaEditarVenda } from './TelaEditarVenda'
import { TelaNovaVenda } from './TelaNovaVenda'

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

function abrir(rota: string) {
  servidor.use(...handlersSessao([criarVinculo('ADM')], undefined, ['venda.gerenciar']))
  return renderizarRotas(
    [
      { path: '/adm/vendas', element: <p>Lista de vendas</p> },
      { path: '/adm/vendas/nova', element: <TelaNovaVenda /> },
      { path: '/adm/vendas/:id', element: <p>Painel da venda aberto</p> },
      { path: '/adm/vendas/:id/editar', element: <TelaEditarVenda /> },
    ],
    rota,
  )
}

const abrirNova = () => abrir('/adm/vendas/nova')
const abrirEdicao = (venda = criarVenda(1)) => {
  servidor.use(handlerVenda(() => venda), ...handlersEscritaVendas(chamadas, { venda }))
  return abrir(`/adm/vendas/${venda.id}/editar`)
}

async function preencherOBasico(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(await screen.findByLabelText('Nome da venda'), 'Lasanhas — 3ª edição')
  await usuario.type(screen.getByLabelText(/Nome do produto 1/), 'Lasanha de carne')
  await usuario.type(screen.getByLabelText(/Nome curto do produto 1/), 'Carne')
  await usuario.type(screen.getByLabelText(/Preço do produto 1/), '25')
  await usuario.click(screen.getByRole('checkbox', { name: 'Dinheiro' }))
}

describe('Nova venda', () => {
  it('abre com o título, o texto de apoio e o "Voltar" do formulário', async () => {
    abrirNova()
    expect(await screen.findByRole('heading', { level: 1, name: 'Nova venda' })).toBeInTheDocument()
    expect(screen.getByText('Você muda tudo isto depois, em Editar venda.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/adm/vendas')
    expect(screen.getByRole('button', { name: 'Salvar venda' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /apagar|excluir/i })).not.toBeInTheDocument()
  })

  it('salvar vazio mostra o erro em cada campo obrigatório e não chama a API', async () => {
    servidor.use(...handlersEscritaVendas(chamadas))
    abrirNova()
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Salvar venda' }))
    expect(await screen.findByText('Dê um nome à venda')).toBeInTheDocument()
    expect(screen.getByText('Dê um nome ao produto')).toBeInTheDocument()
    expect(screen.getByText('Dê um nome curto ao produto')).toBeInTheDocument()
    expect(screen.getByText('Informe um preço')).toBeInTheDocument()
    expect(screen.getByText('Escolha ao menos uma forma de pagamento.')).toBeInTheDocument()
    expect(chamadas).toEqual([])
  })

  it('Pix sem chave nem favorecido e 7me sem orientação erram no campo certo', async () => {
    abrirNova()
    const usuario = userEvent.setup()
    await preencherOBasico(usuario)
    await usuario.click(screen.getByRole('checkbox', { name: 'Pix' }))
    await usuario.click(screen.getByRole('checkbox', { name: '7me' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar venda' }))
    expect(await screen.findByText('Informe a chave Pix')).toBeInTheDocument()
    expect(screen.getByText('Informe o favorecido')).toBeInTheDocument()
    expect(screen.getByText('Oriente como pagar pelo 7me')).toBeInTheDocument()
    expect(screen.getByLabelText('Chave Pix')).toHaveAttribute('aria-invalid', 'true')
  })

  it('preço ou taxa que não é dinheiro erra no campo, em português', async () => {
    abrirNova()
    const usuario = userEvent.setup()
    await preencherOBasico(usuario)
    await usuario.clear(screen.getByLabelText(/Preço do produto 1/))
    await usuario.type(screen.getByLabelText(/Preço do produto 1/), 'abc')
    await usuario.type(screen.getByLabelText(/Taxa de entrega/), '5,555')
    await usuario.click(screen.getByRole('button', { name: 'Salvar venda' }))
    expect(await screen.findAllByText('Use só números, como 25,00')).toHaveLength(2)
  })

  it('preenchida, grava em centavos com as formas marcadas e vai ao painel da venda', async () => {
    const criada = criarVenda(7)
    servidor.use(...handlersEscritaVendas(chamadas, { venda: criada }))
    const { roteador } = abrirNova()
    const usuario = userEvent.setup()
    await preencherOBasico(usuario)
    await usuario.type(screen.getByLabelText(/Taxa de entrega/), '5')
    await usuario.type(screen.getByLabelText('Data da retirada'), '14112026')
    await usuario.type(screen.getByLabelText('Horário da retirada'), '9h às 12h')
    await usuario.type(screen.getByLabelText('Local da retirada'), 'Salão da igreja')
    await usuario.type(screen.getByLabelText('Instruções de consumo'), 'Guarde na geladeira.')
    await usuario.click(screen.getByRole('checkbox', { name: 'Pix' }))
    await usuario.type(screen.getByLabelText('Chave Pix'), '00.000.000/0001-00')
    await usuario.type(screen.getByLabelText('Favorecido'), 'Clube Teste')
    await usuario.click(screen.getByRole('button', { name: 'Salvar venda' }))

    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/vendas/${criada.id}`))
    expect(chamadas).toEqual([
      {
        metodo: 'POST',
        caminho: '/api/vendas',
        corpo: {
          nome: 'Lasanhas — 3ª edição',
          taxaEntrega: 500,
          retiradaData: '2026-11-14',
          retiradaHorario: '9h às 12h',
          retiradaLocal: 'Salão da igreja',
          instrucoes: 'Guarde na geladeira.',
          produtos: [{ nome: 'Lasanha de carne', nomeCurto: 'Carne', preco: 2500 }],
          formas: [{ tipo: 'PIX', chave: '00.000.000/0001-00', favorecido: 'Clube Teste' }, { tipo: 'DINHEIRO' }],
        },
      },
    ])
  })

  it('campos de retirada e instruções vazios vão como nulo', async () => {
    servidor.use(...handlersEscritaVendas(chamadas))
    abrirNova()
    const usuario = userEvent.setup()
    await preencherOBasico(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Salvar venda' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0]?.corpo).toMatchObject({ taxaEntrega: 0, retiradaData: null, retiradaHorario: null, retiradaLocal: null, instrucoes: null })
  })

  it('"Adicionar produto" abre outra linha e "Remover" tira a escolhida', async () => {
    servidor.use(...handlersEscritaVendas(chamadas))
    abrirNova()
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText(/Nome do produto 1/), 'Primeiro')
    await usuario.click(screen.getByRole('button', { name: 'Adicionar produto' }))
    await usuario.type(screen.getByLabelText(/Nome do produto 2/), 'Segundo')
    await usuario.click(screen.getByRole('button', { name: 'Remover produto 1' }))
    expect(screen.queryByLabelText(/Nome do produto 2/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Nome do produto 1/)).toHaveValue('Segundo')
  })

  it('a recusa da API aparece junto do botão e o formulário continua preenchido', async () => {
    servidor.use(http.post('/api/vendas', () => Response.json({ codigo: 'VALIDACAO', mensagem: 'Escolha ao menos uma forma de pagamento.' }, { status: 422 })))
    abrirNova()
    const usuario = userEvent.setup()
    await preencherOBasico(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Salvar venda' }))
    expect(await screen.findAllByText('Escolha ao menos uma forma de pagamento.')).not.toHaveLength(0)
    expect(screen.getByLabelText('Nome da venda')).toHaveValue('Lasanhas — 3ª edição')
  })

  it('erro de campo devolvido pela API cai no campo', async () => {
    servidor.use(http.post('/api/vendas', () => Response.json({ codigo: 'VALIDACAO', mensagem: 'Dados inválidos.', campos: { nome: 'Já existe uma venda com esse nome' } }, { status: 400 })))
    abrirNova()
    const usuario = userEvent.setup()
    await preencherOBasico(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Salvar venda' }))
    expect(await screen.findByText('Já existe uma venda com esse nome')).toBeInTheDocument()
  })

  it('sem internet o botão fica desligado e o motivo está escrito', async () => {
    estado.modo = 'SEM_CONEXAO'
    abrirNova()
    expect(await screen.findByRole('button', { name: 'Salvar venda' })).toBeDisabled()
    expect(screen.getByText('Salvar a venda precisa de internet. Conecte-se para continuar.')).toBeInTheDocument()
  })

  it('enquanto grava, o botão fica ocupado', async () => {
    servidor.use(http.post('/api/vendas', async () => { await delay('infinite') }))
    abrirNova()
    const usuario = userEvent.setup()
    await preencherOBasico(usuario)
    await usuario.click(screen.getByRole('button', { name: 'Salvar venda' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar venda' })).toBeDisabled())
  })
})

describe('Editar venda', () => {
  const VENDA = criarVenda(1, {
    nome: 'Lasanhas — 2ª edição',
    produtos: [criarProdutoDaVenda(1, { nome: 'Lasanha de carne', nomeCurto: 'Carne', preco: 2500 }), criarProdutoDaVenda(2, { nome: 'Lasanha de frango', nomeCurto: 'Frango', preco: 2250 }), criarProdutoDaVenda(3, { nome: 'Antiga', nomeCurto: 'Antiga', ativo: false })],
    formas: [criarFormaPix(), criarFormaSeteMe({ ativo: false }), criarFormaDinheiro()],
  })

  it('abre preenchida só com o que está ativo', async () => {
    abrirEdicao(VENDA)
    expect(await screen.findByRole('heading', { level: 1, name: 'Editar venda' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Nome da venda')).toHaveValue('Lasanhas — 2ª edição')
    expect(screen.getByLabelText(/Preço do produto 2/)).toHaveValue('22,50')
    expect(screen.getByLabelText(/Taxa de entrega/)).toHaveValue('5,00')
    expect(screen.getByLabelText('Data da retirada')).toHaveValue('14/11/2026')
    expect(screen.queryByLabelText(/Nome do produto 3/)).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Pix' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '7me' })).not.toBeChecked()
    expect(screen.getByLabelText('Chave Pix')).toHaveValue('00.000.000/0001-00')
  })

  it('não oferece apagar: remover da lista só desativa, e o texto diz isso', async () => {
    abrirEdicao(VENDA)
    await screen.findByLabelText('Nome da venda')
    expect(screen.queryByRole('button', { name: /apagar|excluir/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Pedidos já lançados guardam o preço do dia/)).toBeInTheDocument()
    expect(screen.getByText(/Remover tira o produto da venda; os pedidos antigos o mantêm/)).toBeInTheDocument()
  })

  it('remover um produto manda a lista sem ele; os que ficam levam o id', async () => {
    const { roteador } = abrirEdicao(VENDA)
    const usuario = userEvent.setup()
    await screen.findByLabelText('Nome da venda')
    await usuario.click(screen.getByRole('button', { name: 'Remover produto 2' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/vendas/${VENDA.id}`))
    expect(chamadas[0]).toMatchObject({
      metodo: 'PATCH',
      caminho: `/api/vendas/${VENDA.id}`,
      corpo: {
        taxaEntrega: 500,
        produtos: [{ id: VENDA.produtos[0]?.id, nome: 'Lasanha de carne', nomeCurto: 'Carne', preco: 2500 }],
        formas: [{ id: VENDA.formas[0]?.id, tipo: 'PIX' }, { id: VENDA.formas[2]?.id, tipo: 'DINHEIRO' }],
      },
    })
  })

  it('marcar de novo uma forma desativada reaproveita o id dela', async () => {
    abrirEdicao(VENDA)
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('checkbox', { name: '7me' }))
    await usuario.clear(screen.getByLabelText('Como pagar pelo 7me'))
    await usuario.type(screen.getByLabelText('Como pagar pelo 7me'), 'Ofertas > Desbravadores')
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    const formas: unknown = (chamadas[0]?.corpo as { formas?: unknown } | undefined)?.formas
    expect(formas).toContainEqual({ id: VENDA.formas[1]?.id, tipo: 'SETE_ME', orientacao: 'Ofertas > Desbravadores' })
  })

  it('desmarcar a última forma erra no grupo e não grava', async () => {
    abrirEdicao(criarVenda(1, { formas: [criarFormaDinheiro()] }))
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('checkbox', { name: 'Dinheiro' }))
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Escolha ao menos uma forma de pagamento.')).toBeInTheDocument()
    expect(chamadas).toEqual([])
  })

  it('venda encerrada não abre edição: diz o motivo e oferece Reabrir', async () => {
    const encerrada = criarVenda(1, { encerradaEm: '2026-04-12T12:00:00.000Z' })
    const reaberta = criarVenda(1)
    let atual = encerrada
    servidor.use(handlerVenda(() => atual), ...handlersEscritaVendas(chamadas, { venda: reaberta }))
    abrir(`/adm/vendas/${encerrada.id}/editar`)
    expect(await screen.findByText('Esta venda foi encerrada.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome da venda')).not.toBeInTheDocument()

    atual = reaberta
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reabrir venda' }))
    await waitFor(() => expect(chamadas).toEqual([{ metodo: 'POST', caminho: `/api/vendas/${encerrada.id}/reabrir`, corpo: {} }]))
    expect(await screen.findByLabelText('Nome da venda')).toBeInTheDocument()
  })

  it('sem internet o Reabrir fica desligado com o motivo', async () => {
    estado.modo = 'SEM_CONEXAO'
    abrirEdicao(criarVenda(1, { encerradaEm: '2026-04-12T12:00:00.000Z' }))
    expect(await screen.findByRole('button', { name: 'Reabrir venda' })).toBeDisabled()
    expect(screen.getByText('Reabrir a venda precisa de internet. Conecte-se para continuar.')).toBeInTheDocument()
  })

  it('venda que não existe mostra o aviso com a saída para a lista', async () => {
    servidor.use(handlerVenda(() => ({ status: 404, codigo: 'NAO_ENCONTRADO', mensagem: 'Venda não encontrada.' })))
    abrir(`/adm/vendas/${criarVenda(1).id}/editar`)
    expect(await screen.findByText('Não encontramos a venda')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver as vendas' })).toHaveAttribute('href', '/adm/vendas')
  })

  it('falha de leitura deixa tentar de novo', async () => {
    servidor.use(handlerVenda(() => ({ status: 500, codigo: 'ERRO_INTERNO', mensagem: 'Erro ao ler a venda.' })))
    abrir(`/adm/vendas/${criarVenda(1).id}/editar`)
    expect(await screen.findByText('Erro ao ler a venda.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('enquanto carrega, avisa que está carregando', async () => {
    servidor.use(http.get('/api/vendas/:id', async () => { await delay('infinite') }))
    abrir(`/adm/vendas/${criarVenda(1).id}/editar`)
    expect(await screen.findByRole('status', { name: 'Carregando a venda' })).toBeInTheDocument()
  })
})
