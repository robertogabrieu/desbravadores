import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteObject } from 'react-router-dom'
import type { EstadoFila, ItemFila, ModoConexao } from '../offline'
import { GuardaRota } from '../sessao/GuardaRota'
import { RedirecionamentoRaiz } from '../sessao/RedirecionamentoRaiz'
import { servidor } from '../testes/servidor'
import { criarEu, criarSessao, criarVinculo, handlersSessao, uuid } from '../testes/handlers/sessao'
import type { Vinculo } from '../testes/handlers/sessao'
import { renderizarRotas } from '../testes/renderizar'
import { LayoutAdm } from './LayoutAdm'
import { LayoutCelular } from './LayoutCelular'

const offline = vi.hoisted(() => ({
  modo: 'ONLINE' as ModoConexao,
  pendentesPorVinculo: new Map<string, ItemFila[]>(),
}))

vi.mock('../offline', () => ({
  useConexao: () => ({ modo: offline.modo }),
  useModoSessao: () => offline.modo,
  useFila: () => ({ contagem: { pendentes: 0, erros: 0 } }) as EstadoFila,
  limparDadosDoUsuario: () => Promise.resolve(),
  naoEnviadosDoVinculo: (_usuarioId: string, vinculoId: string) => Promise.resolve(offline.pendentesPorVinculo.get(vinculoId) ?? []),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
  offline.pendentesPorVinculo = new Map()
})

const rotas: RouteObject[] = [
  { path: '/', element: <RedirecionamentoRaiz /> },
  { path: '/papel', element: <p>tela de papel</p> },
  {
    element: <GuardaRota papeis={['CONSELHEIRO', 'INSTRUTOR']} />,
    children: [
      {
        element: <LayoutCelular />,
        children: [
          { path: '/inicio', element: <p>início do celular</p> },
          { path: '/unidade', element: <p>minha unidade</p> },
        ],
      },
    ],
  },
  {
    element: <GuardaRota papeis={['ADM']} />,
    children: [{ element: <LayoutAdm />, children: [{ path: '/adm/desbravadores', element: <p>lista do adm</p> }] }],
  },
]

const conselheiro = criarVinculo('CONSELHEIRO', 1, { unidades: [{ id: uuid(10), nome: 'Águias' }] })
const instrutor = criarVinculo('INSTRUTOR', 2, {
  classes: [
    { id: uuid(20), nome: 'Amigo', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: '--classe-amigo' },
    { id: uuid(21), nome: 'Companheiro', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: '--classe-companheiro' },
  ],
})
const adm = criarVinculo('ADM', 3)
const deOutroClube = criarVinculo('INSTRUTOR', 4, { clube: { id: uuid(901), nome: 'Outro Clube', slug: 'outro' } })

/** Sessão que troca de vínculo ativo de verdade: a rota de papel ativo muda o que /api/eu devolve. */
function servidorComTroca(vinculos: Vinculo[], ativoInicial: string) {
  const estado = { ativo: ativoInicial, pedidos: [] as unknown[] }
  // O msw usa o primeiro handler que casa: os desta sessão vêm antes dos fixos de handlersSessao.
  servidor.use(
    http.post('/api/auth/refresh', () => HttpResponse.json(criarSessao(vinculos, estado.ativo))),
    http.get('/api/eu', () => HttpResponse.json(criarEu(vinculos, estado.ativo))),
    http.post('/api/auth/papel-ativo', async ({ request }) => {
      const corpo = (await request.json()) as { vinculoId: string }
      estado.pedidos.push(corpo)
      estado.ativo = corpo.vinculoId
      return HttpResponse.json(criarSessao(vinculos, corpo.vinculoId))
    }),
    ...handlersSessao(vinculos, ativoInicial),
  )
  return estado
}

const SELO = /^Papel: .+\. Trocar de papel$/

async function abrirSelo(nome = 'Papel: Conselheiro. Trocar de papel'): Promise<HTMLElement> {
  const selo = await screen.findByRole('button', { name: nome })
  await userEvent.click(selo)
  return screen.getByRole('menu')
}

describe('selo do papel', () => {
  it('quem tem um papel só não vê o selo', async () => {
    servidorComTroca([conselheiro], conselheiro.id)
    renderizarRotas(rotas, '/inicio')
    await screen.findByRole('button', { name: /Ana Souza/ })

    expect(screen.queryByRole('button', { name: SELO })).not.toBeInTheDocument()
  })

  it('dois vínculos, mas só um no clube da sessão: sem selo', async () => {
    servidorComTroca([conselheiro, deOutroClube], conselheiro.id)
    renderizarRotas(rotas, '/inicio')
    await screen.findByRole('button', { name: /Ana Souza/ })

    expect(screen.queryByRole('button', { name: SELO })).not.toBeInTheDocument()
  })

  it('menu lista só os papéis do clube, com escopo, e marca o atual', async () => {
    servidorComTroca([conselheiro, instrutor, adm, deOutroClube], conselheiro.id)
    renderizarRotas(rotas, '/inicio')

    const menu = await abrirSelo()
    const itens = within(menu).getAllByRole('menuitemradio')

    expect(itens).toHaveLength(3)
    expect(itens[0]).toHaveTextContent('Conselheiro')
    expect(itens[0]).toHaveTextContent('Águias')
    expect(itens[0]).toHaveAttribute('aria-checked', 'true')
    expect(itens[1]).toHaveTextContent('Instrutor')
    expect(itens[1]).toHaveTextContent('Amigo, Companheiro')
    expect(itens[1]).toHaveAttribute('aria-checked', 'false')
    expect(itens[2]).toHaveTextContent('Adm')
    expect(within(menu).queryByText(/Outro Clube/)).not.toBeInTheDocument()
  })

  it('trocar chama a rota com o vínculo escolhido, vai ao início do papel e anuncia', async () => {
    const estado = servidorComTroca([conselheiro, instrutor], conselheiro.id)
    const { roteador } = renderizarRotas(rotas, '/unidade')

    const menu = await abrirSelo()
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: /Instrutor/ }))

    await waitFor(() => expect(roteador.state.location.pathname).toBe('/inicio'))
    expect(estado.pedidos).toEqual([{ vinculoId: instrutor.id }])
    expect(await screen.findByRole('status')).toHaveTextContent('Agora você está como Instrutor.')
    expect(await screen.findByRole('button', { name: 'Papel: Instrutor. Trocar de papel' })).toBeInTheDocument()
  })

  it('trocar para Adm leva ao painel do Adm, que também tem o selo', async () => {
    servidorComTroca([conselheiro, adm], conselheiro.id)
    const { roteador } = renderizarRotas(rotas, '/inicio')

    const menu = await abrirSelo()
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: /Adm/ }))

    await screen.findByText('lista do adm')
    expect(roteador.state.location.pathname).toBe('/adm/desbravadores')
    expect(screen.getByRole('button', { name: 'Papel: Adm. Trocar de papel' })).toBeInTheDocument()
    expect(await screen.findByText('Agora você está como Adm.')).toHaveAttribute('role', 'status')
  })

  it('escolher o papel atual só fecha o menu', async () => {
    const estado = servidorComTroca([conselheiro, instrutor], conselheiro.id)
    renderizarRotas(rotas, '/inicio')

    const menu = await abrirSelo()
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: /Conselheiro/ }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(estado.pedidos).toEqual([])
  })

  it('sem internet o selo aparece, mas trocar não chama a rota e avisa', async () => {
    const estado = servidorComTroca([conselheiro, instrutor], conselheiro.id)
    offline.modo = 'SEM_CONEXAO'
    const { roteador } = renderizarRotas(rotas, '/unidade')

    const menu = await abrirSelo()
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: /Instrutor/ }))

    expect(await screen.findByText('Trocar de papel precisa de internet.')).toHaveAttribute('role', 'status')
    expect(estado.pedidos).toEqual([])
    expect(roteador.state.location.pathname).toBe('/unidade')
  })

  it('avisa quando o papel que ficou para trás tem envios aguardando', async () => {
    servidorComTroca([conselheiro, instrutor], conselheiro.id)
    const item = { tipo: 'REUNIAO', vinculoId: conselheiro.id, estado: 'NA_FILA' } as ItemFila
    offline.pendentesPorVinculo.set(conselheiro.id, [item, { ...item }])
    renderizarRotas(rotas, '/inicio')

    const menu = await abrirSelo()
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: /Instrutor/ }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Agora você está como Instrutor. 2 envios da chamada aguardam você voltar a Conselheiro.',
      ),
    )
  })

  it('teclado: abre com Enter, setas movem, Esc fecha e devolve o foco ao selo', async () => {
    servidorComTroca([conselheiro, instrutor], conselheiro.id)
    renderizarRotas(rotas, '/inicio')
    const selo = await screen.findByRole('button', { name: 'Papel: Conselheiro. Trocar de papel' })

    selo.focus()
    await userEvent.keyboard('{Enter}')
    const itens = within(screen.getByRole('menu')).getAllByRole('menuitemradio')
    expect(itens[0]).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(itens[1]).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(itens[0]).toHaveFocus()
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(selo).toHaveFocus()
  })

  it('o item "Trocar de papel" do menu do usuário continua levando a /papel', async () => {
    servidorComTroca([conselheiro, instrutor], conselheiro.id)
    const { roteador } = renderizarRotas(rotas, '/inicio')

    await userEvent.click(await screen.findByRole('button', { name: /Ana Souza/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Trocar de papel' }))

    expect(roteador.state.location.pathname).toBe('/papel')
  })
})
