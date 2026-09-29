import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { simularLargura } from '../testes/midia'
import { servidor } from '../testes/servidor'
import { criarVinculo, handlersSessao } from '../testes/handlers/sessao'
import { renderizarRotas } from '../testes/renderizar'
import { LayoutAdm } from './LayoutAdm'
import { LayoutCelular } from './LayoutCelular'
import type { RouteObject } from 'react-router-dom'

const rotasCelular: RouteObject[] = [
  {
    element: <LayoutCelular />,
    children: [
      { path: '/inicio', element: <p>conteúdo</p> },
      { path: '/unidade', element: <p>minha unidade</p> },
    ],
  },
  { path: '/papel', element: <p>tela de papel</p> },
]
const rotasAdm: RouteObject[] = [
  { element: <LayoutAdm />, children: [{ path: '/adm/desbravadores', element: <p>lista</p> }] },
]

function itemDoMenu(nome: string): HTMLElement {
  const navegacao = screen.getByRole('navigation')
  return within(navegacao).getByText(nome).closest('a, [aria-disabled="true"]') as HTMLElement
}

describe('LayoutCelular', () => {
  it('conselheiro: Início, Unidade habilitados; Reuniões e Ranking "em breve"', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotasCelular, '/inicio')
    await screen.findByText('conteúdo')

    expect(itemDoMenu('Início')).toHaveAttribute('href', '/inicio')
    expect(itemDoMenu('Unidade')).toHaveAttribute('href', '/unidade')
    expect(itemDoMenu('Reuniões')).toHaveAttribute('aria-disabled', 'true')
    expect(itemDoMenu('Ranking')).toHaveAttribute('aria-disabled', 'true')
    expect(within(screen.getByRole('navigation')).getAllByText('em breve')).toHaveLength(2)
    expect(within(screen.getByRole('navigation')).queryByText('Classes')).not.toBeInTheDocument()
  })

  it('instrutor: Início habilitado; Classes, Cronograma e Ranking "em breve"', async () => {
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR')]))
    renderizarRotas(rotasCelular, '/inicio')
    await screen.findByText('conteúdo')

    expect(itemDoMenu('Início')).toHaveAttribute('href', '/inicio')
    for (const nome of ['Classes', 'Cronograma', 'Ranking']) {
      expect(itemDoMenu(nome)).toHaveAttribute('aria-disabled', 'true')
    }
    expect(within(screen.getByRole('navigation')).queryByText('Unidade')).not.toBeInTheDocument()
  })

  it('item desabilitado não navega ao ser tocado', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    const { roteador } = renderizarRotas(rotasCelular, '/inicio')
    await screen.findByText('conteúdo')

    await userEvent.click(itemDoMenu('Reuniões'))

    expect(roteador.state.location.pathname).toBe('/inicio')
  })

  it('menu do usuário: 1 vínculo não oferece "Trocar de papel"', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    renderizarRotas(rotasCelular, '/inicio')

    await userEvent.click(await screen.findByRole('button', { name: /Ana Souza/ }))

    expect(screen.queryByRole('menuitem', { name: 'Trocar de papel' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sair' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Sair de todos os aparelhos' })).toBeInTheDocument()
  })

  it('menu do usuário: 2+ vínculos oferece "Trocar de papel", que leva a /papel', async () => {
    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO', 1), criarVinculo('INSTRUTOR', 2)], undefined))
    const { roteador } = renderizarRotas(rotasCelular, '/inicio')

    await userEvent.click(await screen.findByRole('button', { name: /Ana Souza/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Trocar de papel' }))

    expect(roteador.state.location.pathname).toBe('/papel')
  })

  it('"Sair de todos os aparelhos" chama a rota de sair de todos', async () => {
    let chamadas = 0
    servidor.use(
      http.post('/api/auth/sair-de-todos', () => {
        chamadas += 1
        return new HttpResponse(null, { status: 204 })
      }),
      ...handlersSessao([criarVinculo('CONSELHEIRO')]),
    )
    renderizarRotas(rotasCelular, '/inicio')

    await userEvent.click(await screen.findByRole('button', { name: /Ana Souza/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sair de todos os aparelhos' }))

    await screen.findByText('conteúdo').catch(() => undefined)
    expect(chamadas).toBe(1)
  })
})

describe('LayoutAdm', () => {
  it('habilita Desbravadores, Usuários e Unidades; o resto fica "em breve"', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')

    expect(itemDoMenu('Desbravadores')).toHaveAttribute('href', '/adm/desbravadores')
    expect(itemDoMenu('Usuários')).toHaveAttribute('href', '/adm/usuarios')
    expect(itemDoMenu('Unidades')).toHaveAttribute('href', '/adm/unidades')
    for (const nome of ['Visão geral', 'Classes e especialidades', 'Calendário do clube', 'Cronogramas', 'Ranking', 'Relatórios']) {
      expect(itemDoMenu(nome)).toHaveAttribute('aria-disabled', 'true')
    }
  })

  it('largura de 1280 px: sem faixa', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')
    await screen.findByText('lista')

    expect(screen.queryByText('O painel do Adm é melhor no computador')).not.toBeInTheDocument()
  })

  it('abaixo de 900 px mostra a faixa e não bloqueia o conteúdo', async () => {
    simularLargura(390)
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    renderizarRotas(rotasAdm, '/adm/desbravadores')

    expect(await screen.findByText('O painel do Adm é melhor no computador')).toBeInTheDocument()
    expect(screen.getByText('lista')).toBeInTheDocument()
  })
})
