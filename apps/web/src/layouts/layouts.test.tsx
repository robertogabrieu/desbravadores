import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EstadoFila, ModoConexao, ModoSessao } from '../offline'
import { simularLargura } from '../testes/midia'
import { servidor } from '../testes/servidor'
import { criarVinculo, handlersSessao } from '../testes/handlers/sessao'
import { renderizarRotas } from '../testes/renderizar'
import { LayoutAdm } from './LayoutAdm'
import { LayoutCelular } from './LayoutCelular'
import type { RouteObject } from 'react-router-dom'

const offline = vi.hoisted(() => ({
  modo: 'ONLINE' as ModoConexao,
  modoSessao: null as ModoSessao | null,
  contagem: { pendentes: 0, erros: 0 },
}))

vi.mock('../offline', () => ({
  useConexao: () => ({ modo: offline.modo }),
  useModoSessao: () => offline.modoSessao ?? offline.modo,
  useFila: () => ({ contagem: offline.contagem }) as EstadoFila,
  limparDadosDoUsuario: () => Promise.resolve(),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
  offline.modoSessao = null
  offline.contagem = { pendentes: 0, erros: 0 }
})

const rotasCelular: RouteObject[] = [
  {
    element: <LayoutCelular />,
    children: [
      { path: '/inicio', element: <p>conteúdo</p> },
      { path: '/unidade', element: <p>minha unidade</p> },
    ],
  },
  { path: '/papel', element: <p>tela de papel</p> },
  { path: '/fila', element: <p>tela da fila</p> },
]
const rotasAdm: RouteObject[] = [
  { element: <LayoutAdm />, children: [{ path: '/adm/desbravadores', element: <p>lista</p> }] },
]

/** O layout monta antes de a sessão carregar (sem papel, mostra o menu do Adm): espera o nome no cabeçalho. */
async function esperarSessao(): Promise<void> {
  await screen.findByRole('button', { name: /Ana Souza/ })
}

function itemDoMenu(nome: string): HTMLElement {
  const navegacao = screen.getByRole('navigation')
  return within(navegacao).getByText(nome).closest('a, [aria-disabled="true"]') as HTMLElement
}

describe('LayoutCelular', () => {
  it('conselheiro: Início, Unidade, Reuniões e Ranking habilitados', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotasCelular, '/inicio')
    await screen.findByText('conteúdo')
    await esperarSessao()

    expect(itemDoMenu('Início')).toHaveAttribute('href', '/inicio')
    expect(itemDoMenu('Unidade')).toHaveAttribute('href', '/unidade')
    expect(itemDoMenu('Reuniões')).toHaveAttribute('href', '/reunioes')
    expect(itemDoMenu('Ranking')).toHaveAttribute('href', '/ranking')
    expect(within(screen.getByRole('navigation')).queryByText('em breve')).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation')).queryByText('Classes')).not.toBeInTheDocument()
  })

  it('instrutor: Início, Classes, Cronograma e Ranking habilitados', async () => {
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]))
    renderizarRotas(rotasCelular, '/inicio')
    await screen.findByText('conteúdo')
    await esperarSessao()

    expect(itemDoMenu('Início')).toHaveAttribute('href', '/inicio')
    expect(itemDoMenu('Ranking')).toHaveAttribute('href', '/ranking')
    expect(itemDoMenu('Classes')).toHaveAttribute('href', '/classes')
    expect(itemDoMenu('Cronograma')).toHaveAttribute('href', '/cronograma')
    expect(within(screen.getByRole('navigation')).queryByText('Unidade')).not.toBeInTheDocument()
  })

  it('item desabilitado não navega ao ser tocado', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    const { roteador } = renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')

    await userEvent.click(screen.getByText('Relatórios'))

    expect(roteador.state.location.pathname).toBe('/adm/desbravadores')
  })

  it('menu do usuário: 1 vínculo não oferece "Trocar de papel"', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotasCelular, '/inicio')

    await userEvent.click(await screen.findByRole('button', { name: /Ana Souza/ }))

    expect(screen.queryByRole('menuitem', { name: 'Trocar de papel' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sair' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sair de todos os aparelhos' })).toBeInTheDocument()
  })

  it('menu do usuário: 2+ vínculos oferece "Trocar de papel", que leva a /papel', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO', 1), criarVinculo('INSTRUTOR', 2)], undefined))
    const { roteador } = renderizarRotas(rotasCelular, '/inicio')

    await userEvent.click(await screen.findByRole('button', { name: /Ana Souza/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Trocar de papel' }))

    expect(roteador.state.location.pathname).toBe('/papel')
  })

  it('"Sair de todos os aparelhos" chama a rota de sair de todos', async () => {
    let chamadas = 0
    servidor.use(
      http.post('/api/auth/sair-de-todos', () => {
        chamadas += 1
        return new HttpResponse(null, { status: 204 })
      }),
      ...handlersSessao([criarVinculo('CONSELHEIRO')]),
    )
    renderizarRotas(rotasCelular, '/inicio')

    await userEvent.click(await screen.findByRole('button', { name: /Ana Souza/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sair de todos os aparelhos' }))

    await screen.findByText('conteúdo').catch(() => undefined)
    expect(chamadas).toBe(1)
  })
})

describe('LayoutAdm', () => {
  it('habilita todos os itens do menu, menos Relatórios, que fica "em breve"', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')

    expect(itemDoMenu('Desbravadores')).toHaveAttribute('href', '/adm/desbravadores')
    expect(itemDoMenu('Usuários')).toHaveAttribute('href', '/adm/usuarios')
    expect(itemDoMenu('Unidades')).toHaveAttribute('href', '/adm/unidades')
    expect(itemDoMenu('Ranking')).toHaveAttribute('href', '/ranking')
    expect(itemDoMenu('Visão geral')).toHaveAttribute('href', '/adm')
    expect(itemDoMenu('Classes e especialidades')).toHaveAttribute('href', '/adm/classes')
    expect(itemDoMenu('Calendário do clube')).toHaveAttribute('href', '/adm/calendario')
    expect(itemDoMenu('Cronogramas')).toHaveAttribute('href', '/adm/cronogramas')
    expect(itemDoMenu('Configurações do clube')).toHaveAttribute('href', '/adm/configuracoes')
    expect(itemDoMenu('Relatórios')).toHaveAttribute('aria-disabled', 'true')
  })

  it('largura de 1280 px: sem faixa', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')

    expect(screen.queryByText('O painel do Adm é melhor no computador')).not.toBeInTheDocument()
  })

  it('abaixo de 900 px mostra a faixa e não bloqueia o conteúdo', async () => {
    simularLargura(390)
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')

    expect(await screen.findByText('O painel do Adm é melhor no computador')).toBeInTheDocument()
    expect(screen.getByText('lista')).toBeInTheDocument()
  })
})

describe('Faixa "Sem conexão"', () => {
  it('celular: online não mostra a faixa', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotasCelular, '/inicio')
    await screen.findByText('conteúdo')
    expect(screen.queryByText('Sem conexão')).not.toBeInTheDocument()
  })

  it('celular: em SEM_CONEXAO mostra a faixa', async () => {
    offline.modo = 'SEM_CONEXAO'
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotasCelular, '/inicio')

    expect(await screen.findByText('Sem conexão')).toBeInTheDocument()
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
  })

  it('Adm: em SEM_CONEXAO mostra a faixa; online não', async () => {
    offline.modo = 'SEM_CONEXAO'
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    const { unmount } = renderizarRotas(rotasAdm, '/adm/desbravadores')
    expect(await screen.findByText('Sem conexão')).toBeInTheDocument()
    unmount()

    offline.modo = 'ONLINE'
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')
    expect(screen.queryByText('Sem conexão')).not.toBeInTheDocument()
  })
})

describe('Faixa "Sessão expirada"', () => {
  it('celular: expirada mostra a faixa e "Entrar de novo" faz o logout', async () => {
    let logouts = 0
    offline.modoSessao = 'EXPIRADA'
    servidor.use(
      http.post('/api/auth/logout', () => {
        logouts += 1
        return new HttpResponse(null, { status: 204 })
      }),
      ...handlersSessao([criarVinculo('CONSELHEIRO')]),
    )
    renderizarRotas(rotasCelular, '/inicio')

    expect(await screen.findByText('Sua sessão expirou — salve e entre de novo')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar de novo' }))

    await waitFor(() => expect(logouts).toBe(1))
  })

  it('Adm: expirada mostra a faixa; online não', async () => {
    offline.modoSessao = 'EXPIRADA'
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    const { unmount } = renderizarRotas(rotasAdm, '/adm/desbravadores')
    expect(await screen.findByText('Sua sessão expirou — salve e entre de novo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar de novo' })).toBeInTheDocument()
    unmount()

    offline.modoSessao = null
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')
    expect(screen.queryByText('Sua sessão expirou — salve e entre de novo')).not.toBeInTheDocument()
  })

  it('expirada vence: sem conexão e expirada mostra só a faixa de sessão', async () => {
    offline.modo = 'SEM_CONEXAO'
    offline.modoSessao = 'EXPIRADA'
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotasCelular, '/inicio')

    await screen.findByText('Sua sessão expirou — salve e entre de novo')
    expect(screen.queryByText('Sem conexão')).not.toBeInTheDocument()
  })
})

describe('Selo "aguardando envio" no cabeçalho do celular', () => {
  it('sem itens: não aparece', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotasCelular, '/inicio')
    await screen.findByText('conteúdo')
    expect(screen.queryByRole('link', { name: /aguardando envio/ })).not.toBeInTheDocument()
  })

  it('soma pendentes e erros e leva a /fila', async () => {
    offline.contagem = { pendentes: 2, erros: 1 }
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    const { roteador } = renderizarRotas(rotasCelular, '/inicio')

    await userEvent.click(await screen.findByRole('link', { name: '3 aguardando envio' }))

    expect(roteador.state.location.pathname).toBe('/fila')
  })

  it('com erro usa a cor de alerta; sem erro, não', async () => {
    offline.contagem = { pendentes: 1, erros: 1 }
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    const { unmount } = renderizarRotas(rotasCelular, '/inicio')
    expect(await screen.findByText('2 aguardando envio')).toHaveAttribute('data-tom', 'alerta')
    unmount()

    offline.contagem = { pendentes: 2, erros: 0 }
    renderizarRotas(rotasCelular, '/inicio')
    expect(await screen.findByText('2 aguardando envio')).toHaveAttribute('data-tom', 'neutro')
  })
})

describe('Sair com fila (1a-A3)', () => {
  let logouts = 0
  let sairDeTodos = 0
  beforeEach(() => {
    logouts = 0
    sairDeTodos = 0
    servidor.use(
      http.post('/api/auth/logout', () => {
        logouts += 1
        return new HttpResponse(null, { status: 204 })
      }),
      http.post('/api/auth/sair-de-todos', () => {
        sairDeTodos += 1
        return new HttpResponse(null, { status: 204 })
      }),
      ...handlersSessao([criarVinculo('CONSELHEIRO')]),
    )
  })

  async function abrirMenu(item: string) {
    await userEvent.click(await screen.findByRole('button', { name: /Ana Souza/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: item }))
  }

  it('sem fila sai direto, sem confirmação', async () => {
    renderizarRotas(rotasCelular, '/inicio')
    await abrirMenu('Sair')

    await waitFor(() => expect(logouts).toBe(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('com fila pede confirmação e só sai depois de confirmar', async () => {
    offline.contagem = { pendentes: 2, erros: 1 }
    renderizarRotas(rotasCelular, '/inicio')
    await abrirMenu('Sair')

    const painel = await screen.findByRole('dialog')
    expect(painel).toHaveTextContent('Há 3 itens esperando envio. Eles ficam guardados neste celular e só serão enviados quando você entrar de novo.')
    expect(logouts).toBe(0)

    await userEvent.click(within(painel).getByRole('button', { name: 'Sair' }))

    await waitFor(() => expect(logouts).toBe(1))
  })

  it('cancelar a confirmação mantém a sessão', async () => {
    offline.contagem = { pendentes: 1, erros: 0 }
    renderizarRotas(rotasCelular, '/inicio')
    await abrirMenu('Sair')

    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(logouts).toBe(0)
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
  })

  it('"Sair de todos os aparelhos" com fila também confirma antes', async () => {
    offline.contagem = { pendentes: 0, erros: 2 }
    renderizarRotas(rotasCelular, '/inicio')
    await abrirMenu('Sair de todos os aparelhos')

    const painel = await screen.findByRole('dialog')
    expect(sairDeTodos).toBe(0)
    await userEvent.click(within(painel).getByRole('button', { name: 'Sair de todos os aparelhos' }))

    await waitFor(() => expect(sairDeTodos).toBe(1))
  })
})
