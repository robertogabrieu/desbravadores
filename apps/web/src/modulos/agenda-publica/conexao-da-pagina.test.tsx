import { act, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { definirTokenAcesso } from '../../api/cliente'
import { lerConexao, reiniciarConexao } from '../../offline/conexao'
import { rotas } from '../../rotas'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'

const ENDERECO = '/agenda/clube-exemplo'
const AGENDA = { clube: { nome: 'Clube de Desbravadores Exemplo' }, hoje: '2026-10-13', compromissos: [] }

let pedidos = 0

beforeEach(() => {
  reiniciarConexao()
  pedidos = 0
  servidor.use(
    http.get('/api/agenda-publica/:slug', () => {
      pedidos += 1
      return HttpResponse.json(AGENDA)
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  definirTokenAcesso(null)
  window.history.pushState({}, '', '/')
  reiniciarConexao()
})

describe('conexão da página pública (sem simular useConexao)', () => {
  it('a faixa aparece quando o navegador fica offline e some quando volta', async () => {
    renderizarRotas(rotas, ENDERECO, { enderecoDoNavegador: ENDERECO })
    await screen.findByRole('heading', { level: 1, name: 'Clube de Desbravadores Exemplo' })
    expect(screen.queryByRole('status', { name: 'Sem conexão' })).not.toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(await screen.findByRole('status', { name: 'Sem conexão' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Clube de Desbravadores Exemplo' })).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('status', { name: 'Sem conexão' })).not.toBeInTheDocument()
  })

  it('offline e online do navegador não escrevem no estado global de conexão', async () => {
    renderizarRotas(rotas, ENDERECO, { enderecoDoNavegador: ENDERECO })
    await screen.findByRole('heading', { level: 1 })

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(await screen.findByRole('status', { name: 'Sem conexão' })).toBeInTheDocument()
    expect(lerConexao()).toBe('ONLINE')

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(lerConexao()).toBe('ONLINE')
  })

  it('ao desmontar offline, não mexe no estado global e remove os listeners', async () => {
    const remover = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderizarRotas(rotas, ENDERECO, { enderecoDoNavegador: ENDERECO })
    await screen.findByRole('heading', { level: 1 })
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    await screen.findByRole('status', { name: 'Sem conexão' })

    unmount()
    const tipos = remover.mock.calls.map(([tipo]) => tipo)
    expect(tipos).toContain('offline')
    expect(tipos).toContain('online')
    expect(lerConexao()).toBe('ONLINE')
  })

  it('montar com o navegador offline já mostra a faixa', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderizarRotas(rotas, ENDERECO, { enderecoDoNavegador: ENDERECO })
    expect(await screen.findByRole('status', { name: 'Sem conexão' })).toBeInTheDocument()
    expect(lerConexao()).toBe('ONLINE')
  })

  it('o online do navegador refaz o pedido à API', async () => {
    renderizarRotas(rotas, ENDERECO, { enderecoDoNavegador: ENDERECO })
    await screen.findByRole('heading', { level: 1 })
    const antes = pedidos

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await vi.waitFor(() => expect(pedidos).toBeGreaterThan(antes))
  })
})
