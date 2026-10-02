import { captureException } from '@sentry/react'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TelaErroDeRota } from './TelaErroDeRota'

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

function TelaQueQuebra(): never {
  throw new Error('quebrou na renderização')
}

// Igual ao main.tsx: uma rota raiz sem caminho, só com a tela de erro, envolvendo todas as outras.
function abrir(filhas: RouteObject[], caminho: string) {
  const roteador = createMemoryRouter([{ errorElement: <TelaErroDeRota />, children: filhas }], {
    initialEntries: [caminho],
  })
  render(<RouterProvider router={roteador} />)
}

describe('TelaErroDeRota', () => {
  // O React Router e o React registram no console o erro que a tela segura; aqui é esperado.
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => vi.mocked(captureException).mockClear())

  it('manda ao Sentry, uma vez, o erro lançado numa página e oferece a volta ao início', async () => {
    abrir([{ path: '/quebra', element: <TelaQueQuebra /> }], '/quebra')

    expect(await screen.findByRole('heading', { name: 'Algo deu errado' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/')
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(vi.mocked(captureException).mock.calls[0]?.[0]).toEqual(new Error('quebrou na renderização'))
  })

  it('não manda ao Sentry a resposta 404 de uma rota', async () => {
    // Sem rota que case, o próprio roteador responde 404 à tela de erro.
    abrir([{ path: '/existe', element: <p>existe</p> }], '/sumiu')

    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument()
    expect(captureException).not.toHaveBeenCalled()
  })
})
