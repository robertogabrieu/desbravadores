import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { banco } from '../../offline/banco'
import { tempos } from '../../offline/tempos'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { handlerRefreshSemRede } from '../../testes/handlers/offline'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaConectar } from './TelaConectar'
import type { RouteObject } from 'react-router-dom'

const rotas: RouteObject[] = [
  { path: '/conectar', element: <TelaConectar /> },
  { path: '/', element: <p>tela inicial</p> },
]

describe('TelaConectar', () => {
  it('pede internet e, com a rede de volta, "Tentar de novo" abre o app', async () => {
    tempos.novaTentativaAberturaMs = 1
    servidor.use(handlerRefreshSemRede())
    renderizarRotas(rotas, '/conectar')
    expect(await screen.findByText('Conecte-se à internet para usar o app.')).toBeInTheDocument()

    servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByText('tela inicial')).toBeInTheDocument()
    await waitFor(async () => expect(await banco.sessoes.count()).toBe(1))
  })

  it('continua na tela quando a rede ainda não voltou', async () => {
    tempos.novaTentativaAberturaMs = 1
    servidor.use(handlerRefreshSemRede())
    renderizarRotas(rotas, '/conectar')
    await screen.findByText('Conecte-se à internet para usar o app.')

    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeEnabled())
    expect(screen.getByText('Conecte-se à internet para usar o app.')).toBeInTheDocument()
  })
})
