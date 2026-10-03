import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { useConexao } from '../offline'
import { tempos } from '../offline/tempos'
import { servidor } from '../testes/servidor'
import { requisitarSemResposta } from '../api/cliente'
import { criarEu, criarVinculo, handlerSemSessao, handlersSessao } from '../testes/handlers/sessao'
import { renderizarRotas } from '../testes/renderizar'
import { GuardaRota } from './GuardaRota'
import { RedirecionamentoRaiz } from './RedirecionamentoRaiz'
import { SEM_ACESSO, useSessao } from './useSessao'
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

  it('o navegador avisar que ficou sem internet já vale como sem conexão, sem esperar uma requisição falhar', async () => {
    function Modo() {
      return <p>{`modo ${useConexao().modo}`}</p>
    }
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas([{ element: <GuardaRota />, children: [{ path: '/privada', element: <Modo /> }] }], '/privada')
    expect(await screen.findByText('modo ONLINE')).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(await screen.findByText('modo SEM_CONEXAO')).toBeInTheDocument()
  })
})

describe('sem papel em clube nenhum', () => {
  /** Faz um pedido qualquer da tela; a API recusa porque o papel em uso foi removido. */
  function Tocar() {
    return <button onClick={() => void requisitarSemResposta('/api/algo', { metodo: 'POST' }).catch(() => undefined)}>tocar</button>
  }

  function Reler() {
    const { relerSessao } = useSessao()
    return <button onClick={() => void relerSessao()}>reler</button>
  }

  const rotasSemPapel: RouteObject[] = [
    ...rotas,
    { element: <GuardaRota />, children: [{ path: '/tocar', element: <Tocar /> }, { path: '/reler', element: <Reler /> }] },
  ]

  /** Sessão de conselheiro que, a partir de `perdeu()`, já não tem papel nenhum: /api/eu sem vínculos. */
  function abrirComPapel() {
    const saidas: string[] = []
    let semPapel = false
    servidor.use(
      http.get('/api/eu', () => HttpResponse.json(semPapel ? criarEu([], null) : criarEu([criarVinculo('CONSELHEIRO')]))),
      http.post('/api/algo', () => HttpResponse.json({ codigo: 'VINCULO_INATIVO', mensagem: 'Papel inativo.' }, { status: 403 })),
      http.post('/api/auth/logout', () => {
        saidas.push('logout')
        return new HttpResponse(null, { status: 204 })
      }),
      ...handlersSessao([criarVinculo('CONSELHEIRO')]),
    )
    return { saidas, perdeu: () => (semPapel = true) }
  }

  it('o próximo toque recusado encerra a sessão e leva ao login com o aviso', async () => {
    const { saidas, perdeu } = abrirComPapel()
    const { roteador } = renderizarRotas(rotasSemPapel, '/tocar')
    const botao = await screen.findByRole('button', { name: 'tocar' })
    perdeu()
    await userEvent.click(botao)
    await screen.findByText('tela de login')
    expect(roteador.state.location.state).toEqual({ aviso: SEM_ACESSO })
    await waitFor(() => expect(saidas).toEqual(['logout']))
  })

  it('reler a sessão sem papel nenhum faz o mesmo', async () => {
    const { saidas, perdeu } = abrirComPapel()
    const { roteador } = renderizarRotas(rotasSemPapel, '/reler')
    const botao = await screen.findByRole('button', { name: 'reler' })
    perdeu()
    await userEvent.click(botao)
    await screen.findByText('tela de login')
    expect(roteador.state.location.state).toEqual({ aviso: SEM_ACESSO })
    await waitFor(() => expect(saidas).toEqual(['logout']))
  })

  it('sair por escolha própria não leva o aviso', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    const { roteador } = renderizarRotas(rotas, '/privada')
    await userEvent.click(await screen.findByRole('button', { name: /sair/ }))
    await screen.findByText('tela de login')
    expect(roteador.state.location.state).toBeNull()
  })
})
