import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { configurarCliente } from '../api/cliente'
import { ProvedorSessao } from '../sessao/ProvedorSessao'

interface OpcoesDeRender {
  /** Põe este endereço na barra do jsdom antes de montar: o `ProvedorSessao` decide por ele no primeiro render. */
  enderecoDoNavegador?: string
}

/** Monta rotas com QueryClient limpo, sessão real (falando com o msw) e roteador em memória. */
export function renderizarRotas(rotas: RouteObject[], rotaInicial = '/', opcoes: OpcoesDeRender = {}) {
  if (opcoes.enderecoDoNavegador !== undefined) window.history.pushState({}, '', opcoes.enderecoDoNavegador)
  const clienteConsultas = new QueryClient({
    // Igual ao main.tsx: sem rede, consulta falha e gravação enfileira, em vez de pausar.
    defaultOptions: { queries: { retry: false, networkMode: 'always' }, mutations: { networkMode: 'always' } },
  })
  const roteador = createMemoryRouter(rotas, { initialEntries: [rotaInicial] })
  configurarCliente({ navegar: (caminho) => void roteador.navigate(caminho) })
  const resultado = render(
    <QueryClientProvider client={clienteConsultas}>
      <ProvedorSessao>
        <RouterProvider router={roteador} />
      </ProvedorSessao>
    </QueryClientProvider>,
  )
  return { ...resultado, roteador, clienteConsultas }
}
