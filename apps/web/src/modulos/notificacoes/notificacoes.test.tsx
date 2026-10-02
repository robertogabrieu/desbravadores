import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LayoutAdm } from '../../layouts/LayoutAdm'
import { LayoutCelular } from '../../layouts/LayoutCelular'
import type { ModoConexao } from '../../offline'
import { criarNotificacao, handlerErroNotificacoes, handlersNotificacoes } from '../../testes/handlers/notificacoes'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { Notificacoes } from './Notificacoes'
import type { RouteObject } from 'react-router-dom'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
})

const rotas: RouteObject[] = [
  {
    element: <LayoutCelular />,
    children: [
      { path: '/inicio', element: <p>conteúdo</p> },
      { path: '/notificacoes', element: <Notificacoes /> },
      { path: '/cronograma', element: <p>tela do cronograma</p> },
    ],
  },
  { element: <LayoutAdm />, children: [{ path: '/adm/desbravadores', element: <p>lista do adm</p> }] },
]

const NOME_DO_SINO = /Notificações/

describe('sino', () => {
  it('instrutor vê o sino com o contador de não lidas', async () => {
    const { handlers } = handlersNotificacoes([criarNotificacao(1), criarNotificacao(2), criarNotificacao(3, { lida: true })])
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]), ...handlers)
    renderizarRotas(rotas, '/inicio')

    const sino = await screen.findByRole('link', { name: NOME_DO_SINO })
    expect(sino).toHaveAttribute('href', '/notificacoes')
    expect(await within(sino).findByText('2')).toBeInTheDocument()
  })

  it('Adm também vê o sino', async () => {
    const { handlers } = handlersNotificacoes([criarNotificacao(1)])
    servidor.use(...handlersSessao([criarVinculo('ADM')]), ...handlers)
    renderizarRotas(rotas, '/adm/desbravadores')

    const sino = await screen.findByRole('link', { name: NOME_DO_SINO })
    expect(await within(sino).findByText('1')).toBeInTheDocument()
  })

  it('conselheiro não tem sino e não consulta as notificações', async () => {
    const { handlers, registro } = handlersNotificacoes([criarNotificacao(1)])
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]), ...handlers)
    renderizarRotas(rotas, '/inicio')

    await screen.findByRole('button', { name: /Ana Souza/ })
    expect(screen.queryByRole('link', { name: NOME_DO_SINO })).not.toBeInTheDocument()
    expect(registro.leituras).toBe(0)
  })

  it('sem conexão esconde o contador e não busca', async () => {
    offline.modo = 'SEM_CONEXAO'
    const { handlers, registro } = handlersNotificacoes([criarNotificacao(1)])
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]), ...handlers)
    renderizarRotas(rotas, '/inicio')

    const sino = await screen.findByRole('link', { name: NOME_DO_SINO })
    expect(within(sino).queryByText('1')).not.toBeInTheDocument()
    expect(registro.leituras).toBe(0)
  })

  it('sem não lidas não mostra contador', async () => {
    const { handlers, registro } = handlersNotificacoes([criarNotificacao(1, { lida: true })])
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]), ...handlers)
    renderizarRotas(rotas, '/inicio')

    const sino = await screen.findByRole('link', { name: NOME_DO_SINO })
    await waitFor(() => expect(registro.leituras).toBe(1))
    expect(within(sino).queryByText('0')).not.toBeInTheDocument()
  })
})

describe('página /notificacoes', () => {
  function abrir(itens = [criarNotificacao(1), criarNotificacao(2, { lida: true })]) {
    const { handlers, registro } = handlersNotificacoes(itens)
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]), ...handlers)
    return { registro, ...renderizarRotas(rotas, '/notificacoes') }
  }

  it('lista título, texto e data relativa de cada notificação', async () => {
    abrir()

    expect(await screen.findByText('Notificação 1')).toBeInTheDocument()
    expect(screen.getByText('Texto da notificação 1')).toBeInTheDocument()
    expect(screen.getByText('Notificação 2')).toBeInTheDocument()
    expect(screen.getAllByText(/agora|há /)).toHaveLength(2)
  })

  it('abrir uma notificação marca como lida e leva ao link', async () => {
    const { registro, roteador } = abrir()

    await userEvent.click(await screen.findByRole('link', { name: /Notificação 1/ }))

    await waitFor(() => expect(roteador.state.location.pathname).toBe('/cronograma'))
    expect(registro.marcadas).toEqual([criarNotificacao(1).id])
  })

  it('abrir uma já lida não chama a API de marcar', async () => {
    const { registro, roteador } = abrir()

    await userEvent.click(await screen.findByRole('link', { name: /Notificação 2/ }))

    await waitFor(() => expect(roteador.state.location.pathname).toBe('/cronograma'))
    expect(registro.marcadas).toEqual([])
  })

  it('"Marcar todas como lidas" chama a API, zera o contador e some quando não há o que marcar', async () => {
    const { registro } = abrir()

    await userEvent.click(await screen.findByRole('button', { name: 'Marcar todas como lidas' }))

    await waitFor(() => expect(registro.todasMarcadas).toBe(1))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Marcar todas como lidas' })).not.toBeInTheDocument())
  })

  it('vazio: explica que não há notificações', async () => {
    abrir([])

    expect(await screen.findByText('Nenhuma notificação por enquanto')).toBeInTheDocument()
  })

  it('erro: mostra a mensagem e deixa tentar de novo', async () => {
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]), handlerErroNotificacoes(500, { codigo: 'ERRO_INTERNO', mensagem: 'Falha no servidor' }))
    renderizarRotas(rotas, '/notificacoes')

    expect(await screen.findByText('Falha no servidor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('sem conexão: "Disponível quando houver internet"', async () => {
    offline.modo = 'SEM_CONEXAO'
    abrir()

    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})

describe('sinais das notificações', () => {
  it('cada notificação, lida ou não, mostra a seta de que abre', async () => {
    const { handlers } = handlersNotificacoes([criarNotificacao(1), criarNotificacao(2, { lida: true })])
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]), ...handlers)
    renderizarRotas(rotas, '/notificacoes')
    const primeira = await screen.findByRole('link', { name: /Notificação 1/ })
    expect(primeira.querySelector('[data-sinal="navega"]')).not.toBeNull()
    expect(screen.getByRole('link', { name: /Notificação 2/ }).querySelector('[data-sinal="navega"]')).not.toBeNull()
  })
})
