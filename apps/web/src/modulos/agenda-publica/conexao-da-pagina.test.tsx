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
const FAIXA = { name: 'Sem conexão' }

beforeEach(() => {
  reiniciarConexao()
  servidor.use(http.get('/api/agenda-publica/:slug', () => HttpResponse.json(AGENDA)))
})

afterEach(() => {
  vi.restoreAllMocks()
  definirTokenAcesso(null)
  window.history.pushState({}, '', '/')
  reiniciarConexao()
})

function disparar(tipo: 'offline' | 'online') {
  act(() => {
    window.dispatchEvent(new Event(tipo))
  })
}

describe('conexão da página pública (sem simular useConexao)', () => {
  it('offline mostra a faixa e mantém o conteúdo; online tira a faixa', async () => {
    renderizarRotas(rotas, ENDERECO, { enderecoDoNavegador: ENDERECO })
    await screen.findByRole('heading', { level: 1, name: 'Clube de Desbravadores Exemplo' })
    expect(screen.queryByRole('status', FAIXA)).not.toBeInTheDocument()

    disparar('offline')
    expect(await screen.findByRole('status', FAIXA)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Clube de Desbravadores Exemplo' })).toBeInTheDocument()

    disparar('online')
    await vi.waitFor(() => expect(screen.queryByRole('status', FAIXA)).not.toBeInTheDocument())
  })

  it('navegador dizendo offline na montagem não liga a faixa', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderizarRotas(rotas, ENDERECO, { enderecoDoNavegador: ENDERECO })
    await screen.findByRole('heading', { level: 1, name: 'Clube de Desbravadores Exemplo' })
    expect(screen.queryByRole('status', FAIXA)).not.toBeInTheDocument()
  })

  it('pedido que falha por rede mostra a faixa', async () => {
    servidor.use(http.get('/api/agenda-publica/:slug', () => HttpResponse.error()))
    renderizarRotas(rotas, ENDERECO, { enderecoDoNavegador: ENDERECO })
    expect(await screen.findByRole('status', FAIXA)).toBeInTheDocument()
  })

  it('desmontar remove os mesmos listeners e não mexe no estado global de conexão', async () => {
    const adicionar = vi.spyOn(window, 'addEventListener')
    const remover = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderizarRotas(rotas, ENDERECO, { enderecoDoNavegador: ENDERECO })
    await screen.findByRole('heading', { level: 1 })

    disparar('offline')
    await screen.findByRole('status', FAIXA)
    expect(lerConexao()).toBe('ONLINE')
    disparar('online')
    expect(lerConexao()).toBe('ONLINE')

    unmount()
    for (const tipo of ['offline', 'online']) {
      const adicionadas = adicionar.mock.calls.filter(([t]) => t === tipo).map(([, funcao]) => funcao)
      const removidas = remover.mock.calls.filter(([t]) => t === tipo).map(([, funcao]) => funcao)
      expect(adicionadas.length).toBeGreaterThan(0)
      for (const funcao of adicionadas) {
        const saldo = adicionadas.filter((f) => f === funcao).length - removidas.filter((f) => f === funcao).length
        expect(saldo).toBe(0)
      }
    }
    expect(lerConexao()).toBe('ONLINE')
  })

  it('rede que volta depois de abrir a página sem internet refaz o pedido sozinha', async () => {
    let falhar = true
    servidor.use(http.get('/api/agenda-publica/:slug', () => (falhar ? HttpResponse.error() : HttpResponse.json(AGENDA))))
    renderizarRotas(rotas, ENDERECO, { enderecoDoNavegador: ENDERECO })
    expect(await screen.findByRole('status', FAIXA)).toBeInTheDocument()

    falhar = false
    disparar('online')
    expect(await screen.findByRole('heading', { level: 1, name: 'Clube de Desbravadores Exemplo' })).toBeInTheDocument()
    await vi.waitFor(() => expect(screen.queryByRole('status', FAIXA)).not.toBeInTheDocument())
  })

  it('online com a consulta saudável não faz novo pedido', async () => {
    let pedidos = 0
    servidor.use(
      http.get('/api/agenda-publica/:slug', () => {
        pedidos += 1
        return HttpResponse.json(AGENDA)
      }),
    )
    renderizarRotas(rotas, ENDERECO, { enderecoDoNavegador: ENDERECO })
    await screen.findByRole('heading', { level: 1, name: 'Clube de Desbravadores Exemplo' })
    const antes = pedidos

    disparar('online')
    await new Promise((r) => setTimeout(r, 100))
    expect(pedidos).toBe(antes)
  })
})
