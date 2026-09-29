import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { servidor } from '../testes/servidor'
import { handlerUnidades, handlerUsuarios, handlerCatalogoPermissoes, criarClasse, criarUnidade, criarListaUsuarios, criarCatalogo } from '../testes/handlers/leitura'
import { handlersSessao } from '../testes/handlers/sessao'
import { renovarSessao } from './cliente'
import { useCatalogoPermissoes, useClasses, useUnidades, useUsuariosResumo } from './leitura'

function envolver() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
}

describe('hooks de leitura', () => {
  it('useClasses devolve as classes e repassa o filtro', async () => {
    let consulta = ''
    servidor.use(
      http.get('/api/classes', ({ request }) => {
        consulta = new URL(request.url).search
        return HttpResponse.json([criarClasse({ nome: 'Guia' })])
      }),
    )
    const { result } = renderHook(() => useClasses({ tipo: 'REGULAR' }), { wrapper: envolver() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]?.nome).toBe('Guia')
    expect(consulta).toBe('?tipo=REGULAR')
  })

  it('useUnidades pede inativas só quando todas=true', async () => {
    let consulta = ''
    servidor.use(
      ...handlersSessao(),
      http.get('/api/unidades', ({ request }) => {
        consulta = new URL(request.url).search
        return HttpResponse.json([criarUnidade({ nome: 'Lobos' })])
      }),
    )
    await renovarSessao()
    const { result } = renderHook(() => useUnidades({ todas: true }), { wrapper: envolver() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]?.nome).toBe('Lobos')
    expect(consulta).toBe('?todas=true')
  })

  it('useUsuariosResumo traz a primeira página com 100', async () => {
    let consulta = ''
    servidor.use(
      http.get('/api/usuarios', ({ request }) => {
        consulta = new URL(request.url).search
        return HttpResponse.json(criarListaUsuarios())
      }),
    )
    const { result } = renderHook(() => useUsuariosResumo(), { wrapper: envolver() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(consulta).toBe('?pagina=1&porPagina=100')
  })

  it('useCatalogoPermissoes devolve o catálogo', async () => {
    servidor.use(handlerCatalogoPermissoes(criarCatalogo()), handlerUnidades(), handlerUsuarios())
    const { result } = renderHook(() => useCatalogoPermissoes(), { wrapper: envolver() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]?.chave).toBe('dbv.ver')
  })

  it('resposta fora do contrato vira erro em vez de dado torto', async () => {
    servidor.use(http.get('/api/classes', () => HttpResponse.json([{ id: 'nao-e-uuid' }])))
    const { result } = renderHook(() => useClasses(), { wrapper: envolver() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
