import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteObject } from 'react-router-dom'
import { LayoutAdm } from '../../layouts/LayoutAdm'
import { LayoutCelular } from '../../layouts/LayoutCelular'
import type { EstadoFila } from '../../offline'
import { servidor } from '../../testes/servidor'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { rotasConta } from './rotas'

const offline = vi.hoisted(() => ({ contagem: { pendentes: 0, erros: 0 } }))

vi.mock('../../offline', () => ({
  useConexao: () => ({ modo: 'ONLINE' }),
  useModoSessao: () => 'ONLINE',
  useFila: () => ({ contagem: offline.contagem }) as EstadoFila,
  limparDadosDoUsuario: () => Promise.resolve(),
  naoEnviadosDoVinculo: () => Promise.resolve([]),
}))

beforeEach(() => {
  offline.contagem = { pendentes: 0, erros: 0 }
})

const rotas: RouteObject[] = [
  { element: <LayoutCelular />, children: [...rotasConta, { path: '/inicio', element: <p>início</p> }] },
  { path: '/papel', element: <p>tela de papel</p> },
]
const rotasDoAdm: RouteObject[] = [{ element: <LayoutAdm />, children: rotasConta }]

describe('Minha conta', () => {
  it('mostra quem é a pessoa e o papel em uso', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotas, '/conta')

    expect(await screen.findByRole('heading', { name: 'Minha conta' })).toBeInTheDocument()
    expect(await screen.findByText('Ana Souza')).toBeInTheDocument()
    expect(screen.getByText('Conselheiro')).toBeInTheDocument()
  })

  it('o Adm também chega à página, dentro do layout dele', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasDoAdm, '/conta')

    expect(await screen.findByText('Ana Souza')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Menu do Adm' })).toBeInTheDocument()
  })

  it('1 vínculo não oferece "Trocar de papel"', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotas, '/conta')
    await screen.findByText('Ana Souza')

    expect(screen.queryByRole('link', { name: 'Trocar de papel' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair de todos os aparelhos' })).toBeInTheDocument()
  })

  it('2+ vínculos oferece "Trocar de papel", que leva a /papel', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO', 1), criarVinculo('INSTRUTOR', 2)]))
    const { roteador } = renderizarRotas(rotas, '/conta')

    await userEvent.click(await screen.findByRole('link', { name: 'Trocar de papel' }))

    expect(roteador.state.location.pathname).toBe('/papel')
  })

  describe('sair', () => {
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

    async function tocar(nome: string) {
      await userEvent.click(await screen.findByRole('button', { name: nome }))
    }

    it('sem fila sai direto, sem confirmação', async () => {
      renderizarRotas(rotas, '/conta')
      await tocar('Sair')

      await waitFor(() => expect(logouts).toBe(1))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('"Sair de todos os aparelhos" chama a rota de sair de todos', async () => {
      renderizarRotas(rotas, '/conta')
      await tocar('Sair de todos os aparelhos')

      await waitFor(() => expect(sairDeTodos).toBe(1))
    })

    it('com fila pede confirmação e só sai depois de confirmar', async () => {
      offline.contagem = { pendentes: 2, erros: 1 }
      renderizarRotas(rotas, '/conta')
      await tocar('Sair')

      const painel = await screen.findByRole('dialog')
      expect(painel).toHaveTextContent('Há 3 itens esperando envio. Eles ficam guardados neste celular e só serão enviados quando você entrar de novo.')
      expect(logouts).toBe(0)

      await userEvent.click(within(painel).getByRole('button', { name: 'Sair' }))

      await waitFor(() => expect(logouts).toBe(1))
    })

    it('cancelar a confirmação mantém a sessão', async () => {
      offline.contagem = { pendentes: 1, erros: 0 }
      renderizarRotas(rotas, '/conta')
      await tocar('Sair')

      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(logouts).toBe(0)
      expect(screen.getByRole('heading', { name: 'Minha conta' })).toBeInTheDocument()
    })

    it('"Sair de todos os aparelhos" com fila também confirma antes', async () => {
      offline.contagem = { pendentes: 0, erros: 2 }
      renderizarRotas(rotas, '/conta')
      await tocar('Sair de todos os aparelhos')

      const painel = await screen.findByRole('dialog')
      expect(sairDeTodos).toBe(0)
      await userEvent.click(within(painel).getByRole('button', { name: 'Sair de todos os aparelhos' }))

      await waitFor(() => expect(sairDeTodos).toBe(1))
    })
  })
})
