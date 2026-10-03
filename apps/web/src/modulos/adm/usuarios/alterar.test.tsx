import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import type { HttpHandler } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VinculoUsuario } from '../../../api/usuarios'
import { caixa } from '../../../testes/handlers/caixa'
import { criarUnidade, handlerUnidades } from '../../../testes/handlers/leitura'
import { handlersSessao, uuid } from '../../../testes/handlers/sessao'
import { criarUsuario, criarVinculoUsuario, handlerCatalogoUsuarios, handlerEditarVinculo, handlerListaUsuarios, handlerRegra422, handlerUsuario } from '../../../testes/handlers/usuarios'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import type { ModoConexao } from '../../../offline'
import { rotasAdmUsuarios } from './rotas'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
})

const aguias = criarUnidade({ id: uuid(201), nome: 'Águias' })
const falcoes = criarUnidade({ id: uuid(202), nome: 'Falcões' })
const FICHA = `/adm/usuarios/${uuid(710)}`
const ALTERAR = `${FICHA}/papeis/${uuid(602)}`

const vinculoConselheira = (parcial: Partial<VinculoUsuario> = {}) =>
  criarVinculoUsuario('CONSELHEIRO', 2, { unidades: [{ id: aguias.id, nome: 'Águias' }], ...parcial })

const carla = (vinculos: VinculoUsuario[] = [criarVinculoUsuario('ADM', 1), vinculoConselheira(), criarVinculoUsuario('INSTRUTOR', 3)]) =>
  caixa(criarUsuario({ id: uuid(710), nome: 'Carla Mendes', genero: 'F', vinculos }))

function abrir(rota: string, usuario = carla(), ...especiais: HttpHandler[]) {
  servidor.use(
    ...especiais,
    ...handlersSessao(),
    handlerUsuario(usuario),
    handlerListaUsuarios([usuario.atual]),
    handlerCatalogoUsuarios(),
    handlerUnidades([aguias, falcoes]),
  )
  return renderizarRotas(rotasAdmUsuarios, rota)
}

const salvar = () => userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
const abrirAjustes = async () => userEvent.click(await screen.findByRole('button', { name: /Ajustar o que pode fazer/ }))

describe('Alterar papel · tela', () => {
  it('Voltar com o nome, sobretítulo, h1 com o papel e as unidades do papel marcadas', async () => {
    abrir(ALTERAR)
    expect(await screen.findByRole('heading', { level: 1, name: 'Conselheira' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar para Carla Mendes' })).toHaveAttribute('href', FICHA)
    expect(screen.getByText('Carla Mendes · Alterar papel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Águias' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Falcões' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('unidade inativa que o papel tem aparece marcada, e Salvar sem mexer nela manda o id dela', async () => {
    const lobos = { id: uuid(299), nome: 'Lobos' }
    const corpos: unknown[] = []
    const usuario = carla([vinculoConselheira({ unidades: [{ id: aguias.id, nome: 'Águias' }, lobos] })])
    abrir(ALTERAR, usuario, handlerEditarVinculo(usuario.atual, corpos))
    expect(await screen.findByRole('button', { name: 'Lobos (inativa)' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Falcões' }))
    await salvar()
    await waitFor(() => expect(corpos).toHaveLength(1))
    expect(corpos[0]).toEqual({ unidadeIds: [aguias.id, lobos.id, falcoes.id], ajustes: [] })
  })

  it('"Ajustar o que pode fazer" começa recolhido, com aria-expanded e aria-controls', async () => {
    abrir(ALTERAR)
    const botao = await screen.findByRole('button', { name: /Ajustar o que pode fazer/ })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    const lista = document.getElementById(botao.getAttribute('aria-controls') ?? '')
    expect(lista).toHaveAttribute('hidden')
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(botao).not.toHaveTextContent('alteração')
    await userEvent.click(botao)
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    expect(lista).not.toHaveAttribute('hidden')
  })

  it('com ajuste no papel, o cabeçalho recolhido já diz "1 alteração"', async () => {
    const usuario = carla([vinculoConselheira({ ajustes: [{ permissao: 'dbv.editar', concedida: true }] })])
    abrir(ALTERAR, usuario)
    expect(await screen.findByRole('button', { name: /Ajustar o que pode fazer/ })).toHaveTextContent('1 alteração')
  })

  it('aberto, um interruptor por permissão do papel, com "padrão" como descrição', async () => {
    abrir(ALTERAR)
    await abrirAjustes()
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    const ver = screen.getByRole('switch', { name: 'Ver desbravadores' })
    expect(ver).toHaveAttribute('aria-checked', 'true')
    expect(ver).toHaveAccessibleDescription('padrão')
    const editar = screen.getByRole('switch', { name: 'Editar dados dos desbravadores' })
    expect(editar).toHaveAttribute('aria-checked', 'false')
    expect(editar).toHaveAccessibleDescription('padrão')
    expect(screen.queryByRole('switch', { name: 'Montar cronograma da classe' })).not.toBeInTheDocument()
  })

  it('ligar uma desligada: "alterado" e "1 alteração"; desligar de novo volta a "padrão" e o ajuste some do corpo', async () => {
    const corpos: unknown[] = []
    const usuario = carla()
    abrir(ALTERAR, usuario, handlerEditarVinculo(usuario.atual, corpos))
    await abrirAjustes()
    const editar = screen.getByRole('switch', { name: 'Editar dados dos desbravadores' })
    await userEvent.click(editar)
    expect(editar).toHaveAttribute('aria-checked', 'true')
    expect(editar).toHaveAccessibleDescription('alterado')
    expect(screen.getByRole('button', { name: /Ajustar o que pode fazer/ })).toHaveTextContent('1 alteração')
    await userEvent.click(editar)
    expect(editar).toHaveAttribute('aria-checked', 'false')
    expect(editar).toHaveAccessibleDescription('padrão')
    expect(screen.getByRole('button', { name: /Ajustar o que pode fazer/ })).not.toHaveTextContent('alteração')
    await userEvent.click(screen.getByRole('switch', { name: 'Ver desbravadores' }))
    await salvar()
    await waitFor(() => expect(corpos).toEqual([{ unidadeIds: [aguias.id], ajustes: [{ permissao: 'dbv.ver', concedida: false }] }]))
  })

  it('"Volta ao padrão do papel" zera os ajustes do rascunho e só grava no Salvar', async () => {
    const corpos: unknown[] = []
    const usuario = carla([vinculoConselheira({ ajustes: [{ permissao: 'dbv.editar', concedida: true }] })])
    abrir(ALTERAR, usuario, handlerEditarVinculo(usuario.atual, corpos))
    await abrirAjustes()
    expect(screen.getByRole('switch', { name: 'Editar dados dos desbravadores' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Volta ao padrão do papel' }))
    expect(screen.getByRole('switch', { name: 'Editar dados dos desbravadores' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: /Ajustar o que pode fazer/ })).not.toHaveTextContent('alteração')
    expect(corpos).toEqual([])
    await salvar()
    await waitFor(() => expect(corpos).toEqual([{ unidadeIds: [aguias.id], ajustes: [] }]))
  })

  it('rascunho limpo: ajuste igual ao padrão não conta e Salvar sem mexer não chama a API e volta à ficha', async () => {
    const corpos: unknown[] = []
    const usuario = carla([vinculoConselheira({ ajustes: [{ permissao: 'dbv.ver', concedida: true }] })])
    const { roteador } = abrir(FICHA, usuario, handlerEditarVinculo(usuario.atual, corpos))
    await userEvent.click(within(await screen.findByRole('region', { name: 'Conselheira' })).getByRole('link', { name: 'Alterar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Conselheira' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ajustar o que pode fazer/ })).not.toHaveTextContent('alteração')
    await abrirAjustes()
    expect(screen.getByRole('switch', { name: 'Ver desbravadores' })).toHaveAccessibleDescription('padrão')
    await salvar()
    await waitFor(() => expect(roteador.state.location.pathname).toBe(FICHA))
    expect(corpos).toEqual([])
    expect(roteador.state.historyAction).toBe('REPLACE')
  })

  it('marcar e desmarcar uma unidade (ordem diferente, mesmos ids) é igual ao inicial: não chama a API', async () => {
    const corpos: unknown[] = []
    const usuario = carla()
    const { roteador } = abrir(ALTERAR, usuario, handlerEditarVinculo(usuario.atual, corpos))
    await userEvent.click(await screen.findByRole('button', { name: 'Águias' }))
    await userEvent.click(screen.getByRole('button', { name: 'Águias' }))
    await salvar()
    await waitFor(() => expect(roteador.state.location.pathname).toBe(FICHA))
    expect(corpos).toEqual([])
  })

  it('Salvar manda o PUT com escopo e ajustes, nunca o papel, e volta à ficha com replace e o estado de volta', async () => {
    const corpos: unknown[] = []
    const usuario = carla()
    const { roteador } = abrir(FICHA, usuario, handlerEditarVinculo(usuario.atual, corpos))
    await userEvent.click(within(await screen.findByRole('region', { name: 'Conselheira' })).getByRole('link', { name: 'Alterar' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Falcões' }))
    await abrirAjustes()
    await userEvent.click(screen.getByRole('switch', { name: 'Editar dados dos desbravadores' }))
    await salvar()
    await waitFor(() => expect(roteador.state.location.pathname).toBe(FICHA))
    expect(corpos).toEqual([{ unidadeIds: [aguias.id, falcoes.id], ajustes: [{ permissao: 'dbv.editar', concedida: true }] }])
    expect(roteador.state.historyAction).toBe('REPLACE')
    expect(roteador.state.location.state).toEqual({ voltarPara: '/adm/usuarios', voltarRotulo: 'Usuários' })
  })

  it('Cancelar e Voltar levam à ficha com o estado de volta', async () => {
    const { roteador } = abrir(FICHA)
    await userEvent.click(within(await screen.findByRole('region', { name: 'Conselheira' })).getByRole('link', { name: 'Alterar' }))
    await userEvent.click(await screen.findByRole('link', { name: 'Cancelar' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(FICHA))
    expect(roteador.state.location.state).toMatchObject({ voltarPara: '/adm/usuarios', voltarRotulo: 'Usuários' })
    await userEvent.click(within(await screen.findByRole('region', { name: 'Conselheira' })).getByRole('link', { name: 'Alterar' }))
    await userEvent.click(await screen.findByRole('link', { name: 'Voltar para Carla Mendes' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(FICHA))
    expect(roteador.state.location.state).toMatchObject({ voltarPara: '/adm/usuarios', voltarRotulo: 'Usuários' })
  })

  it('escopo vazio: sem PUT, mensagem junto do Salvar e foco no grupo, que aponta para ela', async () => {
    const corpos: unknown[] = []
    const usuario = carla()
    abrir(ALTERAR, usuario, handlerEditarVinculo(usuario.atual, corpos))
    await userEvent.click(await screen.findByRole('button', { name: 'Águias' }))
    await salvar()
    const mensagem = await screen.findByRole('alert')
    expect(mensagem).toHaveTextContent('Escolha pelo menos uma unidade.')
    const grupo = screen.getByRole('group', { name: 'Escolha das unidades' })
    expect(grupo).toHaveFocus()
    expect(grupo).toHaveAttribute('aria-describedby', mensagem.id)
    expect(corpos).toEqual([])
  })

  it('papel removido por outra pessoa: a ficha abre com o aviso', async () => {
    const usuario = carla()
    const removido = { ...usuario.atual, vinculos: [vinculoConselheira({ ativo: false })] }
    const { roteador } = abrir(ALTERAR, usuario, handlerEditarVinculo(removido))
    await userEvent.click(await screen.findByRole('button', { name: 'Falcões' }))
    await salvar()
    await waitFor(() => expect(roteador.state.location.pathname).toBe(FICHA))
    expect(await screen.findByText('Este papel foi removido por outra pessoa.')).toBeInTheDocument()
  })

  it('papel removido por outra pessoa: "Não encontramos este papel" nunca aparece no caminho para a ficha', async () => {
    const usuario = carla()
    const removido = { ...usuario.atual, vinculos: [vinculoConselheira({ ativo: false })] }
    const { roteador } = abrir(ALTERAR, usuario, handlerEditarVinculo(removido))
    await userEvent.click(await screen.findByRole('button', { name: 'Falcões' }))
    servidor.use(handlerUsuario(caixa(removido)))
    let apareceu = false
    const observador = new MutationObserver(() => {
      if (document.body.textContent.includes('Não encontramos este papel')) apareceu = true
    })
    observador.observe(document.body, { childList: true, subtree: true, characterData: true })
    await salvar()
    await waitFor(() => expect(roteador.state.location.pathname).toBe(FICHA))
    expect(await screen.findByText('Este papel foi removido por outra pessoa.')).toBeInTheDocument()
    observador.disconnect()
    expect(apareceu).toBe(false)
  })

  it('erro ao gravar (AJUSTE_INVALIDO): mensagem na tela, sem sair', async () => {
    const { roteador } = abrir(ALTERAR, carla(), handlerRegra422('put', '/api/vinculos/:id', 'AJUSTE_INVALIDO'))
    await abrirAjustes()
    await userEvent.click(screen.getByRole('switch', { name: 'Editar dados dos desbravadores' }))
    await salvar()
    expect(await screen.findByRole('alert')).toHaveTextContent('Alguma permissão não vale para este papel.')
    expect(roteador.state.location.pathname).toBe(ALTERAR)
  })
})

describe('Alterar papel · não encontrado e estados', () => {
  it.each([
    ['inexistente', `${FICHA}/papeis/${uuid(699)}`, carla()],
    ['inativo', ALTERAR, carla([vinculoConselheira({ ativo: false })])],
    ['de Adm', `${FICHA}/papeis/${uuid(601)}`, carla()],
    ['de outra pessoa', `${FICHA}/papeis/${uuid(650)}`, carla()],
  ])('vínculo %s: "Não encontramos este papel" com link para a ficha', async (_nome, rota, usuario) => {
    abrir(rota, usuario)
    expect(await screen.findByRole('heading', { name: 'Não encontramos este papel' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar para a ficha' })).toHaveAttribute('href', FICHA)
  })

  it('carregando: sem a tela até ler usuário e lista', async () => {
    abrir(ALTERAR, carla(), http.get('/api/unidades', async () => { await delay(150); return HttpResponse.json([aguias]) }))
    expect(await screen.findByRole('status', { name: /Carregando/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Conselheira' })).toBeInTheDocument()
  })

  it('erro ao ler: mensagem e "Tentar de novo"', async () => {
    abrir(ALTERAR, carla(), http.get('/api/unidades', () => HttpResponse.json({ codigo: 'REGRA', mensagem: 'Lista caiu.' }, { status: 422 })))
    expect(await screen.findByText('Lista caiu.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('sem conexão: "Disponível quando houver internet"', async () => {
    offline.modo = 'SEM_CONEXAO'
    abrir(ALTERAR, carla(), http.get('/api/usuarios/:id', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'x' }, { status: 500 })))
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})
