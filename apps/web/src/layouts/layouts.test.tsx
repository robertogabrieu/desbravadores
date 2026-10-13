import { act, screen, waitFor, within } from '@testing-library/react'
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
      { path: '/conta', element: <p>minha conta</p> },
    ],
  },
  { path: '/papel', element: <p>tela de papel</p> },
  { path: '/fila', element: <p>tela da fila</p> },
]
const rotasAdm: RouteObject[] = [
  { element: <LayoutAdm />, children: [{ path: '/adm/desbravadores', element: <p>lista</p> }] },
]

/** O layout monta antes de a sessão carregar (sem papel, a barra só tem o Início): espera a barra do papel. */
async function esperarSessao(): Promise<void> {
  await within(screen.getByRole('navigation')).findByText('Ranking')
}

function itemDoMenu(nome: string): HTMLElement {
  const navegacao = screen.getByRole('navigation')
  return within(navegacao).getByText(nome).closest('a, [aria-disabled="true"]') as HTMLElement
}

describe('LayoutCelular', () => {
  it('conselheiro: Início, Unidade, Reuniões, Calendário e Ranking habilitados', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotasCelular, '/inicio')
    await screen.findByText('conteúdo')
    await esperarSessao()

    expect(itemDoMenu('Início')).toHaveAttribute('href', '/inicio')
    expect(itemDoMenu('Unidade')).toHaveAttribute('href', '/unidade')
    expect(itemDoMenu('Reuniões')).toHaveAttribute('href', '/reunioes')
    expect(itemDoMenu('Calendário')).toHaveAttribute('href', '/calendario')
    expect(itemDoMenu('Ranking')).toHaveAttribute('href', '/ranking')
    expect(within(screen.getByRole('navigation')).getAllByRole('link')).toHaveLength(5)
    expect(within(screen.getByRole('navigation')).queryByText('em breve')).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation')).queryByText('Classes')).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation')).queryByText('Biblioteca')).not.toBeInTheDocument()
  })

  it('instrutor: Início, Classes, Cronograma, Calendário e Ranking habilitados', async () => {
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]))
    renderizarRotas(rotasCelular, '/inicio')
    await screen.findByText('conteúdo')
    await esperarSessao()

    expect(itemDoMenu('Início')).toHaveAttribute('href', '/inicio')
    expect(itemDoMenu('Ranking')).toHaveAttribute('href', '/ranking')
    expect(itemDoMenu('Classes')).toHaveAttribute('href', '/classes')
    expect(itemDoMenu('Cronograma')).toHaveAttribute('href', '/cronograma')
    expect(itemDoMenu('Calendário')).toHaveAttribute('href', '/calendario')
    expect(within(screen.getByRole('navigation')).getAllByRole('link')).toHaveLength(5)
    expect(within(screen.getByRole('navigation')).queryByText('Unidade')).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation')).queryByText('Biblioteca')).not.toBeInTheDocument()
  })

  it('o cabeçalho tem só o atalho "Minha conta", que leva a /conta: sem nome do usuário nem selo de papel', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO', 1), criarVinculo('INSTRUTOR', 2)]))
    const { roteador } = renderizarRotas(rotasCelular, '/inicio')
    await esperarSessao()

    expect(screen.queryByRole('button', { name: /Ana Souza/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Trocar de papel/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Minha conta' }))

    expect(roteador.state.location.pathname).toBe('/conta')
  })
})

describe('marca do app', () => {
  it('celular e Adm mostram o emblema e o nome "App do Desbravador"', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    const { unmount } = renderizarRotas(rotasCelular, '/inicio')
    await esperarSessao()
    expect(screen.getByRole('img', { name: 'Emblema dos Desbravadores' })).toHaveAttribute('src', '/emblema.png')
    expect(screen.getByText('App do Desbravador')).toBeInTheDocument()
    unmount()

    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')
    expect(screen.getByRole('img', { name: 'Emblema dos Desbravadores' })).toBeInTheDocument()
    expect(screen.getByText('App do Desbravador')).toBeInTheDocument()
  })
})

describe('LayoutAdm', () => {
  it('o menu tem 7 entradas no topo; os grupos abrem e fecham e só o da tela aberta já vem aberto', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')
    const menu = within(screen.getByRole('navigation', { name: 'Menu do Adm' }))

    const topo = ['Visão geral', 'Membros', 'Classes', 'Calendário do clube', 'Ranking', 'Biblioteca', 'Configurações do clube']
    for (const rotulo of topo) expect(menu.getByText(rotulo)).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'Membros' })).toHaveAttribute('aria-expanded', 'true')
    expect(menu.getByRole('button', { name: 'Classes' })).toHaveAttribute('aria-expanded', 'false')
    expect(menu.queryByText('Cronogramas')).not.toBeInTheDocument()
    expect(menu.queryByText('Relatórios')).not.toBeInTheDocument()

    await userEvent.click(menu.getByRole('button', { name: 'Classes' }))
    expect(menu.getByRole('button', { name: 'Classes' })).toHaveAttribute('aria-expanded', 'true')
    expect(menu.getByText('Cronogramas')).toBeInTheDocument()

    await userEvent.click(menu.getByRole('button', { name: 'Classes' }))
    expect(menu.queryByText('Cronogramas')).not.toBeInTheDocument()
    // O grupo da tela aberta não fecha: o item atual não pode sumir do menu, e o botão avisa que não responde.
    await userEvent.click(menu.getByRole('button', { name: 'Membros' }))
    expect(menu.getByText('Usuários')).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'Membros' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('cada item aponta para a sua tela, dentro do grupo ou solto', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')
    const menu = within(screen.getByRole('navigation', { name: 'Menu do Adm' }))
    await userEvent.click(menu.getByRole('button', { name: 'Classes' }))
    await userEvent.click(menu.getByRole('button', { name: 'Ranking' }))

    const destinos: Array<[string, string]> = [
      ['Visão geral', '/adm'],
      ['Desbravadores', '/adm/desbravadores'],
      ['Usuários', '/adm/usuarios'],
      ['Unidades', '/adm/unidades'],
      ['Classes e especialidades', '/adm/classes'],
      ['Classe Bíblica', '/adm/classe-biblica'],
      ['Cronogramas', '/adm/cronogramas'],
      ['Calendário do clube', '/adm/calendario'],
      ['Regras de pontuação', '/adm/ranking/regras'],
      ['Biblioteca', '/adm/biblioteca'],
      ['Configurações do clube', '/adm/configuracoes'],
    ]
    for (const [rotulo, destino] of destinos) expect(menu.getByRole('link', { name: rotulo })).toHaveAttribute('href', destino)
    expect(menu.getByRole('link', { name: 'Ranking' })).toHaveAttribute('href', '/ranking')
  })

  it('o cabeçalho do Adm tem o atalho "Minha conta" e o sino, sem nome do usuário nem selo de papel', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')

    expect(screen.getByRole('link', { name: 'Minha conta' })).toHaveAttribute('href', '/conta')
    expect(screen.queryByRole('button', { name: /Ana Souza/ })).not.toBeInTheDocument()
  })

  it('só o item da tela aberta fica marcado: Visão geral não acende nas outras telas do Adm', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')

    expect(itemDoMenu('Desbravadores')).toHaveAttribute('aria-current', 'page')
    expect(itemDoMenu('Visão geral')).not.toHaveAttribute('aria-current')
  })

  it('largura de 1280 px: sem faixa', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')

    expect(screen.queryByText('O painel do Adm é melhor no computador')).not.toBeInTheDocument()
  })

  it('largura de 1280 px: menu lateral sempre à vista, sem botão de abrir', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')

    expect(screen.getByRole('navigation', { name: 'Menu do Adm' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir o menu' })).not.toBeInTheDocument()
  })

  it('abaixo de 900 px o menu fica numa gaveta: abre pelo botão e fecha ao escolher um item', async () => {
    simularLargura(390)
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    const { roteador } = renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')
    expect(screen.queryByRole('navigation', { name: 'Menu do Adm' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Abrir o menu' }))
    const gaveta = screen.getByRole('dialog', { name: 'Menu do Adm' })
    await userEvent.click(within(gaveta).getByText('Usuários'))

    expect(roteador.state.location.pathname).toBe('/adm/usuarios')
    expect(screen.queryByRole('dialog', { name: 'Menu do Adm' })).not.toBeInTheDocument()
  })

  it('abaixo de 900 px a gaveta também tem "Biblioteca", e escolhê-la abre a biblioteca do Adm', async () => {
    simularLargura(390)
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    const { roteador } = renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')

    await userEvent.click(screen.getByRole('button', { name: 'Abrir o menu' }))
    const gaveta = screen.getByRole('dialog', { name: 'Menu do Adm' })
    await userEvent.click(within(gaveta).getByText('Biblioteca'))

    expect(roteador.state.location.pathname).toBe('/adm/biblioteca')
    expect(screen.queryByRole('dialog', { name: 'Menu do Adm' })).not.toBeInTheDocument()
  })

  it('abaixo de 900 px a gaveta fecha com Esc e pelo botão Fechar', async () => {
    simularLargura(390)
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')

    await userEvent.click(screen.getByRole('button', { name: 'Abrir o menu' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Menu do Adm' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Abrir o menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Fechar o menu' }))
    expect(screen.queryByRole('dialog', { name: 'Menu do Adm' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir o menu' })).toHaveFocus()
  })

  it('abaixo de 900 px, com a gaveta aberta, o Tab não sai dela e a página de trás não rola', async () => {
    simularLargura(390)
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')

    await userEvent.click(screen.getByRole('button', { name: 'Abrir o menu' }))
    const gaveta = screen.getByRole('dialog', { name: 'Menu do Adm' })
    expect(document.body.style.overflow).toBe('hidden')

    within(gaveta).getByRole('link', { name: 'Usuários' }).focus()
    await userEvent.tab()
    expect(gaveta).toContainElement(document.activeElement as HTMLElement)
    await userEvent.tab({ shift: true })
    await userEvent.tab({ shift: true })
    expect(gaveta).toContainElement(document.activeElement as HTMLElement)

    await userEvent.keyboard('{Escape}')
    expect(document.body.style.overflow).toBe('')
  })

  it('gaveta aberta e a tela passa de 900 px: ao voltar para o celular, ela não reabre sozinha', async () => {
    simularLargura(390)
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')
    await userEvent.click(screen.getByRole('button', { name: 'Abrir o menu' }))

    act(() => simularLargura(1280))
    expect(screen.queryByRole('dialog', { name: 'Menu do Adm' })).not.toBeInTheDocument()
    act(() => simularLargura(390))
    expect(screen.queryByRole('dialog', { name: 'Menu do Adm' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir o menu' })).toBeInTheDocument()
  })

  it('abaixo de 900 px mostra a faixa e não bloqueia o conteúdo', async () => {
    simularLargura(390)
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')

    expect(await screen.findByText('O painel do Adm é melhor no computador')).toBeInTheDocument()
    expect(screen.getByText('lista')).toBeInTheDocument()
  })

  it('abaixo de 900 px a faixa fecha pelo botão e não volta depois de recarregar', async () => {
    localStorage.clear()
    simularLargura(390)
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    const { unmount } = renderizarRotas(rotasAdm, '/adm/desbravadores')
    await userEvent.click(await screen.findByRole('button', { name: 'Fechar aviso' }))
    expect(screen.queryByText('O painel do Adm é melhor no computador')).not.toBeInTheDocument()

    unmount()
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')
    expect(screen.queryByText('O painel do Adm é melhor no computador')).not.toBeInTheDocument()
    localStorage.clear()
  })

  it('sem armazenamento no aparelho a faixa aparece e fecha só nesta visita', async () => {
    const ler = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('armazenamento bloqueado')
    })
    const gravar = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('armazenamento bloqueado')
    })
    try {
      simularLargura(390)
      servidor.use(...handlersSessao([criarVinculo('ADM')]))
      const { unmount } = renderizarRotas(rotasAdm, '/adm/desbravadores')
      await userEvent.click(await screen.findByRole('button', { name: 'Fechar aviso' }))
      expect(screen.queryByText('O painel do Adm é melhor no computador')).not.toBeInTheDocument()

      unmount()
      renderizarRotas(rotasAdm, '/adm/desbravadores')
      expect(await screen.findByText('O painel do Adm é melhor no computador')).toBeInTheDocument()
    } finally {
      ler.mockRestore()
      gravar.mockRestore()
    }
  })

  it('a margem lateral do conteúdo é definida uma vez, no layout', async () => {
    simularLargura(390)
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    const conteudo = (await screen.findByText('lista')).closest('main')
    expect(conteudo).toHaveAttribute('data-layout', 'adm')
    expect(conteudo).toHaveClass('px-4', 'min-[900px]:px-12')
  })
})

describe('Faixa "Sem conexão"', () => {
  it('celular: online não mostra a faixa', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotasCelular, '/inicio')
    await screen.findByText('conteúdo')
    expect(screen.queryByText('Sem conexão. Mostrando o que está guardado no aparelho.')).not.toBeInTheDocument()
  })

  it('celular: em SEM_CONEXAO mostra a faixa', async () => {
    offline.modo = 'SEM_CONEXAO'
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotasCelular, '/inicio')

    expect(await screen.findByText('Sem conexão. Mostrando o que está guardado no aparelho.')).toBeInTheDocument()
    expect(await screen.findByText('conteúdo')).toBeInTheDocument()
  })

  it('Adm: em SEM_CONEXAO mostra a faixa; online não', async () => {
    offline.modo = 'SEM_CONEXAO'
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    const { unmount } = renderizarRotas(rotasAdm, '/adm/desbravadores')
    expect(await screen.findByText('Sem conexão. Mostrando o que está guardado no aparelho.')).toBeInTheDocument()
    unmount()

    offline.modo = 'ONLINE'
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')
    expect(screen.queryByText('Sem conexão. Mostrando o que está guardado no aparelho.')).not.toBeInTheDocument()
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
    expect(screen.queryByText('Sem conexão. Mostrando o que está guardado no aparelho.')).not.toBeInTheDocument()
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
