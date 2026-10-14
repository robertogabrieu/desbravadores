import { act, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { definirTokenAcesso } from '../../api/cliente'
import { reiniciarConexao } from '../../offline/conexao'
import { rotas } from '../../rotas'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'

const ENDERECO = '/agenda/clube-exemplo'
const AGENDA = { clube: { nome: 'Clube de Desbravadores Exemplo' }, hoje: '2026-10-13', compromissos: [] }

beforeEach(() => {
  reiniciarConexao()
  servidor.use(http.get('/api/agenda-publica/:slug', () => HttpResponse.json(AGENDA)))
})

afterEach(() => {
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
})
