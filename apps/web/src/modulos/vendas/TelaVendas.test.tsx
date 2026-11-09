import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { criarResumoDeVenda, handlerListaDeVendas } from '../../testes/handlers/vendas'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaVendas } from './TelaVendas'

const ABERTA = criarResumoDeVenda(1, { nome: 'Lasanhas — 2ª edição' })
const ENCERRADA = criarResumoDeVenda(2, {
  nome: 'Lasanhas — 1ª edição', encerradaEm: '2026-04-12T12:00:00.000Z', pedidos: 46, unidadesVendidas: 162, vendido: 407_500, recebido: 407_500, retiradaData: '2026-04-11',
})

function abrir() {
  servidor.use(...handlersSessao([criarVinculo('ADM')], undefined, ['venda.gerenciar']))
  return renderizarRotas(
    [
      { path: '/adm/vendas', element: <TelaVendas /> },
      { path: '/adm/vendas/nova', element: <p>Formulário da venda</p> },
      { path: '/adm/vendas/:id', element: <p>Painel da venda aberto</p> },
    ],
    '/adm/vendas',
  )
}

describe('TelaVendas', () => {
  it('mostra a aberta primeiro, com os números, e a encerrada sob "Encerradas"', async () => {
    servidor.use(handlerListaDeVendas(() => ({ vendas: [ABERTA, ENCERRADA] })))
    abrir()
    expect(await screen.findByRole('heading', { level: 1, name: 'Vendas' })).toBeInTheDocument()
    expect(await screen.findByText('2 vendas · 1 em andamento')).toBeInTheDocument()

    const cartoes = await screen.findAllByRole('link', { name: /Lasanhas/ })
    expect(cartoes.map((cartao) => cartao.getAttribute('href'))).toEqual([`/adm/vendas/${ABERTA.id}`, `/adm/vendas/${ENCERRADA.id}`])

    const aberta = within(cartoes[0])
    expect(aberta.getByText('Em andamento')).toBeInTheDocument()
    expect(aberta.getByText('Sábado, 14/11 · 9h às 12h · Salão da igreja')).toBeInTheDocument()
    expect(aberta.getByText('47')).toBeInTheDocument()
    expect(aberta.getByText('R$ 3.930')).toBeInTheDocument()
    expect(aberta.getByText('R$ 375')).toBeInTheDocument()
    expect(aberta.getByText('a receber')).toBeInTheDocument()

    expect(screen.getByText('Encerradas')).toBeInTheDocument()
    const encerrada = within(cartoes[1])
    expect(encerrada.getByText('Encerrada')).toBeInTheDocument()
    expect(encerrada.getByText('R$ 4.075')).toBeInTheDocument()
    expect(encerrada.queryByText('a receber')).not.toBeInTheDocument()
  })

  it('só com venda aberta não escreve "Encerradas"', async () => {
    servidor.use(handlerListaDeVendas(() => ({ vendas: [ABERTA] })))
    abrir()
    expect(await screen.findByText('1 venda · 1 em andamento')).toBeInTheDocument()
    expect(screen.queryByText('Encerradas')).not.toBeInTheDocument()
  })

  it('"Nova venda" é um só botão e leva ao formulário', async () => {
    servidor.use(handlerListaDeVendas(() => ({ vendas: [ABERTA] })))
    const { roteador } = abrir()
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('link', { name: 'Nova venda' }))
    expect(roteador.state.location.pathname).toBe('/adm/vendas/nova')
  })

  it('abrir o cartão leva ao painel da venda', async () => {
    servidor.use(handlerListaDeVendas(() => ({ vendas: [ABERTA] })))
    const { roteador } = abrir()
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('link', { name: /Lasanhas — 2ª edição/ }))
    expect(roteador.state.location.pathname).toBe(`/adm/vendas/${ABERTA.id}`)
  })

  it('sem venda ensina e oferece "Nova venda"', async () => {
    servidor.use(handlerListaDeVendas(() => ({ vendas: [] })))
    abrir()
    expect(await screen.findByText('Nenhuma venda ainda.')).toBeInTheDocument()
    expect(screen.getByText(/Crie uma venda com seus produtos, preços e o local de retirada/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Nova venda' })).toHaveLength(1)
  })

  it('enquanto carrega, avisa que está carregando', async () => {
    servidor.use(http.get('/api/vendas', async () => { await delay('infinite') }))
    abrir()
    expect(await screen.findByRole('status', { name: 'Carregando as vendas' })).toBeInTheDocument()
  })

  it('falha da API mostra a mensagem e deixa tentar de novo', async () => {
    let falhar = true
    servidor.use(
      http.get('/api/vendas', () =>
        falhar ? Response.json({ codigo: 'ERRO_INTERNO', mensagem: 'Erro ao listar as vendas.' }, { status: 500 }) : Response.json({ vendas: [ABERTA] }),
      ),
    )
    abrir()
    expect(await screen.findByText('Erro ao listar as vendas.')).toBeInTheDocument()
    falhar = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Lasanhas — 2ª edição')).toBeInTheDocument()
  })

  it('sem rede diz que precisa de internet', async () => {
    servidor.use(http.get('/api/vendas', () => HttpResponse.error()))
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Nova venda' })).not.toBeInTheDocument()
  })
})
