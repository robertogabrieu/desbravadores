import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { tempos } from '../offline/tempos'
import { servidor } from '../testes/servidor'
import { criarVinculo, handlerSemSessao, handlersSessao } from '../testes/handlers/sessao'
import { renderizarRotas } from '../testes/renderizar'
import { GuardaRota } from './GuardaRota'
import { RedirecionamentoRaiz } from './RedirecionamentoRaiz'
import { useSessao } from './useSessao'
import type { RouteObject } from 'react-router-dom'

function Botao() {
  const { sair, eu } = useSessao()
  return <button onClick={() => void sair()}>sair {eu?.usuario.nome}</button>
}

const rotas: RouteObject[] = [
  { path: '/', element: <RedirecionamentoRaiz /> },
  { path: '/login', element: <p>tela de login</p> },
  { path: '/papel', element: <p>tela de papel</p> },
  { path: '/conectar', element: <p>tela de conectar</p> },
  { path: '/inicio', element: <p>tela de inicio</p> },
  { path: '/adm/desbravadores', element: <p>tela adm</p> },
  {
    element: <GuardaRota />,
    children: [
      { path: '/privada', element: <Botao /> },
      { element: <GuardaRota papeis={['ADM']} />, children: [{ path: '/so-adm', element: <p>area do adm</p> }] },
    ],
  },
  { element: <GuardaRota semVinculo />, children: [{ path: '/sem-vinculo-ok', element: <p>escolha</p> }] },
]

describe('redirecionamento de "/"', () => {
  it('sem sessão vai a /login', async () => {
    servidor.use(handlerSemSessao())
    const { roteador } = renderizarRotas(rotas, '/')
    await screen.findByText('tela de login')
    expect(roteador.state.location.pathname).toBe('/login')
  })

  it('ADM vai a /adm/desbravadores', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotas, '/')
    expect(await screen.findByText('tela adm')).toBeInTheDocument()
  })

  it('conselheiro e instrutor vão a /inicio', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotas, '/')
    expect(await screen.findByText('tela de inicio')).toBeInTheDocument()
  })

  it('com 2 vínculos e nenhum escolhido vai a /papel', async () => {
    const vinculos = [criarVinculo('CONSELHEIRO', 1), criarVinculo('INSTRUTOR', 2)]
    servidor.use(...handlersSessao(vinculos, null))
    renderizarRotas(rotas, '/')
    expect(await screen.findByText('tela de papel')).toBeInTheDocument()
  })
})

describe('guarda de rota', () => {
  it('sem sessão manda para /login', async () => {
    servidor.use(handlerSemSessao())
    const { roteador } = renderizarRotas(rotas, '/privada')
    await screen.findByText('tela de login')
    expect(roteador.state.location.pathname).toBe('/login')
  })

  it('com sessão mostra a rota e o nome do usuário vem de /api/eu', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotas, '/privada')
    expect(await screen.findByRole('button', { name: 'sair Ana Souza' })).toBeInTheDocument()
  })

  it('sem vínculo ativo manda para /papel, mas a rota marcada semVinculo abre', async () => {
    const vinculos = [criarVinculo('CONSELHEIRO', 1), criarVinculo('INSTRUTOR', 2)]
    servidor.use(...handlersSessao(vinculos, null))
    renderizarRotas(rotas, '/privada')
    expect(await screen.findByText('tela de papel')).toBeInTheDocument()

    renderizarRotas(rotas, '/sem-vinculo-ok')
    expect(await screen.findByText('escolha')).toBeInTheDocument()
  })

  it('papel fora da lista volta para "/" e cai na tela do próprio papel', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotas, '/so-adm')
    expect(await screen.findByText('tela de inicio')).toBeInTheDocument()
  })

  it('papel permitido entra', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotas, '/so-adm')
    expect(await screen.findByText('area do adm')).toBeInTheDocument()
  })

  it('sair chama o logout e devolve para /login', async () => {
    let logout = 0
    servidor.use(
      http.post('/api/auth/logout', () => {
        logout += 1
        return new HttpResponse(null, { status: 204 })
      }),
      ...handlersSessao([criarVinculo('ADM')]),
    )
    const { roteador } = renderizarRotas(rotas, '/privada')

    await userEvent.click(await screen.findByRole('button', { name: /^sair/ }))

    await waitFor(() => expect(roteador.state.location.pathname).toBe('/login'))
    expect(logout).toBe(1)
  })

  it('sair limpa o cache de consultas (celular compartilhado)', async () => {
    servidor.use(
      http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
      ...handlersSessao([criarVinculo('ADM')]),
    )
    const { roteador, clienteConsultas } = renderizarRotas(rotas, '/privada')
    clienteConsultas.setQueryData(['observacoes', 'x'], { texto: 'sigiloso' })

    await userEvent.click(await screen.findByRole('button', { name: /^sair/ }))

    await waitFor(() => expect(roteador.state.location.pathname).toBe('/login'))
    expect(clienteConsultas.getQueryData(['observacoes', 'x'])).toBeUndefined()
  })

  it('refresh com 200 fora do contrato conta como rede: sem identidade guardada vai a /conectar', async () => {
    tempos.novaTentativaAberturaMs = 1
    servidor.use(http.post('/api/auth/refresh', () => HttpResponse.json({ lixo: true })))

    const { roteador } = renderizarRotas(rotas, '/privada')

    await screen.findByText('tela de conectar')
    expect(roteador.state.location.pathname).toBe('/conectar')
  })
})
