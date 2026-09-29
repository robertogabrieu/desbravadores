import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import { configurarCliente } from '../api/cliente'
import { ProvedorSessao } from '../sessao/ProvedorSessao'

/** Monta rotas com QueryClient limpo, sessão real (falando com o msw) e roteador em memória. */
export function renderizarRotas(rotas: RouteObject[], rotaInicial = '/') {
  const clienteConsultas = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
