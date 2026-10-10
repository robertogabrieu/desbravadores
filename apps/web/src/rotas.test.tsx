import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from './offline'
import { handlersClasseBiblica } from './testes/handlers/classe-biblica'
import { criarVinculo, handlersSessao } from './testes/handlers/sessao'
import { renderizarRotas } from './testes/renderizar'
import { servidor } from './testes/servidor'
import type { Papel } from '@desbravadores/shared'
import { rotas } from './rotas'

vi.mock('./offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('./offline')>()),
  useConexao: () => ({ modo: 'ONLINE' as ModoConexao }),
  useModoSessao: () => 'ONLINE' as const,
  useFila: () => ({ itens: [], contagem: { pendentes: 0, erros: 0 } }),
  usePacote: () => ({ pacote: null, carregando: false, baixadoEm: null }),
  limparDadosDoUsuario: () => Promise.resolve(),
}))

beforeEach(() => vi.clearAllMocks())

function entrar(papel: Papel) {
  servidor.use(...handlersSessao([criarVinculo(papel)]))
}

describe('rotas do instrutor', () => {
  it('/inicio mostra a tela do instrutor para INSTRUTOR', async () => {
    entrar('INSTRUTOR')
    renderizarRotas(rotas, '/inicio')
    expect(await screen.findByRole('heading', { name: 'Início do instrutor' })).toBeInTheDocument()
  })

  it('/inicio mostra a tela da 1b para CONSELHEIRO', async () => {
    entrar('CONSELHEIRO')
    renderizarRotas(rotas, '/inicio')
    await screen.findByRole('button', { name: /Ana Souza/ })
    expect(screen.queryByRole('heading', { name: 'Início do instrutor' })).not.toBeInTheDocument()
  })

  it('Classes e Cronograma ficam habilitados na barra do instrutor', async () => {
    entrar('INSTRUTOR')
    renderizarRotas(rotas, '/inicio')
    const barra = within(await screen.findByRole('navigation'))
    expect(barra.getByRole('link', { name: 'Classes' })).toHaveAttribute('href', '/classes')
    expect(barra.getByRole('link', { name: 'Cronograma' })).toHaveAttribute('href', '/cronograma')
  })

  it.each([
    ['/classes', 'Minhas classes'],
    ['/cronograma', 'Cronograma'],
    ['/classes/x/progresso', 'Progresso da classe'],
    ['/especialidades', 'Especialidades'],
    ['/observacoes', 'Observações'],
    ['/classes/x/materiais', 'Materiais de apoio'],
  ])('%s abre a tela para INSTRUTOR', async (rota, titulo) => {
    entrar('INSTRUTOR')
    renderizarRotas(rotas, rota)
    expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument()
  })

  it.each(['/aulas/nova', '/aulas/x/editar'])('%s abre o registro de aula para INSTRUTOR (sem pacote baixado)', async (rota) => {
    entrar('INSTRUTOR')
    renderizarRotas(rotas, rota)
    expect(await screen.findByRole('heading', { name: 'A lista de desbravadores ainda não foi baixada' })).toBeInTheDocument()
  })

  it('conselheiro não entra nas telas do instrutor', async () => {
    entrar('CONSELHEIRO')
    renderizarRotas(rotas, '/classes')
    await screen.findByRole('button', { name: /Ana Souza/ })
    expect(screen.queryByRole('heading', { name: 'Minhas classes' })).not.toBeInTheDocument()
  })
})

describe('rotas da Classe Bíblica', () => {
  it('o Adm abre a lista de edições pelo menu', async () => {
    entrar('ADM')
    servidor.use(...handlersClasseBiblica())
    renderizarRotas(rotas, '/adm/classe-biblica')
    expect(await screen.findByRole('heading', { name: 'Classe Bíblica', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Classe Bíblica' })).toHaveAttribute('href', '/adm/classe-biblica')
  })

  it('o Conselheiro abre a chamada do grupo', async () => {
    entrar('CONSELHEIRO')
    servidor.use(...handlersClasseBiblica())
    renderizarRotas(rotas, '/classe-biblica/encontros/x/grupos/y/chamada')
    expect(await screen.findByRole('heading', { name: 'Chamada da Classe Bíblica' })).toBeInTheDocument()
  })

  it('o Conselheiro não abre a lista de edições do Adm', async () => {
    entrar('CONSELHEIRO')
    servidor.use(...handlersClasseBiblica())
    renderizarRotas(rotas, '/adm/classe-biblica')
    await screen.findByRole('button', { name: /Ana Souza/ })
    expect(screen.queryByRole('heading', { name: 'Classe Bíblica', level: 1 })).not.toBeInTheDocument()
  })
})
