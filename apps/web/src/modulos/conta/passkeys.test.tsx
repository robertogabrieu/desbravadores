import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import type { RouteObject } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EstadoFila } from '../../offline'
import { LayoutCelular } from '../../layouts/LayoutCelular'
import { erroDaApi } from '../../testes/handlers/auth'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { lerAparelho } from '../passkey/aparelho'
import { rotasConta } from './rotas'

const conexao = vi.hoisted(() => ({ modo: 'ONLINE' as 'ONLINE' | 'SEM_CONEXAO' }))
vi.mock('../../offline', () => ({
  useConexao: () => ({ modo: conexao.modo }),
  useModoSessao: () => conexao.modo,
  useFila: () => ({ contagem: { pendentes: 0, erros: 0 } }) as EstadoFila,
  limparDadosDoUsuario: () => Promise.resolve(),
  naoEnviadosDoVinculo: () => Promise.resolve([]),
}))

const navegador = vi.hoisted(() => ({ startRegistration: vi.fn(), startAuthentication: vi.fn() }))
vi.mock('@simplewebauthn/browser', () => navegador)

const rotas: RouteObject[] = [{ element: <LayoutCelular />, children: rotasConta }]
const ID_A = '00000000-0000-4000-8000-0000000000a1'
const ID_B = '00000000-0000-4000-8000-0000000000b2'
const minhas = [
  { id: ID_A, nome: 'Chrome no Android', criadoEm: '2026-10-01T15:00:00.000Z', ultimoUsoEm: '2026-10-10T15:00:00.000Z' },
  { id: ID_B, nome: 'Safari no iPhone', criadoEm: '2026-10-02T15:00:00.000Z', ultimoUsoEm: null },
]
const opcoesDeCadastro = {
  challenge: 'desafio',
  rp: { name: 'Desbravadores' },
  user: { id: 'u', name: 'ana@clube.test', displayName: 'Ana' },
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
}
const resposta = {
  id: 'cred',
  rawId: 'cred',
  type: 'public-key',
  response: { clientDataJSON: 'a', attestationObject: 'b' },
  clientExtensionResults: {},
}

const listaDe = (itens: unknown[]) => http.get('/api/eu/passkeys', () => HttpResponse.json({ itens }))
const cartao = async () => within((await screen.findByRole('heading', { name: 'Entrar com digital ou rosto' })).parentElement as HTMLElement)

beforeEach(() => {
  conexao.modo = 'ONLINE'
  localStorage.clear()
  navegador.startRegistration.mockReset()
  vi.stubGlobal('PublicKeyCredential', class {})
  servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Minha conta: entrar com digital ou rosto', () => {
  it('fica entre "Papel em uso" e "Sessão"', async () => {
    servidor.use(listaDe([]))
    renderizarRotas(rotas, '/conta')
    await screen.findByRole('heading', { name: 'Papel em uso' })
    await screen.findByRole('button', { name: 'Ativar neste aparelho' })

    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titulos).toEqual(['Papel em uso', 'Entrar com digital ou rosto', 'Sessão'])
  })

  it('aparelho sem suporte explica e não oferece botão nem chama a API', async () => {
    vi.unstubAllGlobals()
    renderizarRotas(rotas, '/conta')

    expect(await screen.findByText('Este aparelho não permite entrar com digital ou rosto.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ativar/ })).not.toBeInTheDocument()
  })

  it('carregando: mostra o estado de carga até a lista chegar', async () => {
    servidor.use(
      http.get('/api/eu/passkeys', async () => {
        await delay(150)
        return HttpResponse.json({ itens: [] })
      }),
    )
    renderizarRotas(rotas, '/conta')

    expect(await screen.findByRole('status', { name: 'Carregando digitais' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Ativar neste aparelho' })).toBeInTheDocument()
  })

  it('vazio: texto curto e "Ativar neste aparelho"', async () => {
    servidor.use(listaDe([]))
    renderizarRotas(rotas, '/conta')

    expect(await screen.findByRole('button', { name: 'Ativar neste aparelho' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remover/ })).not.toBeInTheDocument()
  })

  it('erro: mostra a mensagem da API e "Tentar de novo" busca outra vez', async () => {
    let chamadas = 0
    servidor.use(
      http.get('/api/eu/passkeys', () => {
        chamadas += 1
        return chamadas === 1 ? erroDaApi(500, 'ERRO_INTERNO', 'Falha ao carregar as digitais.') : HttpResponse.json({ itens: minhas })
      }),
    )
    renderizarRotas(rotas, '/conta')

    expect(await screen.findByText('Falha ao carregar as digitais.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Chrome no Android')).toBeInTheDocument()
  })

  it('lista nome, quando foi criada e quando foi usada pela última vez', async () => {
    servidor.use(listaDe(minhas))
    renderizarRotas(rotas, '/conta')

    expect(await screen.findByText('Chrome no Android')).toBeInTheDocument()
    expect(screen.getByText(/Criada em 01\/10\/2026 · usada por último em 10\/10\/2026/)).toBeInTheDocument()
    expect(screen.getByText(/Criada em 02\/10\/2026 · ainda não usada/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ativar outra' })).toBeEnabled()
  })

  it('sem conexão: Ativar e Remover ficam desligados com o motivo escrito', async () => {
    conexao.modo = 'SEM_CONEXAO'
    servidor.use(listaDe(minhas))
    renderizarRotas(rotas, '/conta')
    await screen.findByText('Chrome no Android')

    expect(screen.getByRole('button', { name: 'Ativar outra' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remover Chrome no Android' })).toBeDisabled()
    expect(screen.getByText(/Sem conexão: conecte-se à internet para ativar ou remover\./)).toBeInTheDocument()
  })

  it('sem conexão e sem a lista carregada: mostra o motivo além do aviso de erro', async () => {
    conexao.modo = 'SEM_CONEXAO'
    servidor.use(http.get('/api/eu/passkeys', () => erroDaApi(500, 'ERRO_INTERNO', 'Falha ao carregar as digitais.')))
    renderizarRotas(rotas, '/conta')

    expect(await screen.findByText('Falha ao carregar as digitais.')).toBeInTheDocument()
    expect(screen.getByText(/Sem conexão: conecte-se à internet para ativar ou remover\./)).toBeInTheDocument()
  })

  it('Remover pede confirmação, apaga a certa e atualiza a lista', async () => {
    let itens = [...minhas]
    const removidas: string[] = []
    servidor.use(
      http.get('/api/eu/passkeys', () => HttpResponse.json({ itens })),
      http.delete('/api/eu/passkeys/:id', ({ params }) => {
        removidas.push(String(params['id']))
        itens = itens.filter((p) => p.id !== params['id'])
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderizarRotas(rotas, '/conta')
    await userEvent.click(await screen.findByRole('button', { name: 'Remover Chrome no Android' }))

    const painel = await screen.findByRole('dialog')
    expect(removidas).toEqual([])
    await userEvent.click(within(painel).getByRole('button', { name: 'Remover' }))

    await waitFor(() => expect(screen.queryByText('Chrome no Android')).not.toBeInTheDocument())
    expect(removidas).toEqual([ID_A])
    expect(screen.getByText('Safari no iPhone')).toBeInTheDocument()
  })

  it('cancelar a remoção não apaga nada', async () => {
    const removidas: string[] = []
    servidor.use(
      listaDe(minhas),
      http.delete('/api/eu/passkeys/:id', ({ params }) => {
        removidas.push(String(params['id']))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderizarRotas(rotas, '/conta')
    await userEvent.click(await screen.findByRole('button', { name: 'Remover Chrome no Android' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(removidas).toEqual([])
  })

  it('Ativar pede a senha, sugere o nome (até 60 caracteres), cadastra e marca o aparelho', async () => {
    let itens: unknown[] = []
    const opcoes: unknown[] = []
    const cadastros: unknown[] = []
    servidor.use(
      http.get('/api/eu/passkeys', () => HttpResponse.json({ itens })),
      http.post('/api/eu/passkeys/opcoes', async ({ request }) => {
        opcoes.push(await request.json())
        return HttpResponse.json({ desafioId: ID_A, opcoes: opcoesDeCadastro })
      }),
      http.post('/api/eu/passkeys', async ({ request }) => {
        cadastros.push(await request.json())
        itens = [minhas[0]]
        return HttpResponse.json(minhas[0], { status: 201 })
      }),
    )
    navegador.startRegistration.mockResolvedValue(resposta)
    renderizarRotas(rotas, '/conta')
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar neste aparelho' }))

    const painel = await screen.findByRole('dialog')
    const nome = within(painel).getByLabelText('Nome deste aparelho')
    expect(nome).toHaveValue('Este aparelho')
    expect(nome).toHaveAttribute('maxlength', '60')
    expect(within(painel).getByRole('button', { name: 'Ativar' })).toBeDisabled()
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Celular da Ana')
    await userEvent.type(within(painel).getByLabelText('Sua senha'), 'segredo')
    await userEvent.click(within(painel).getByRole('button', { name: 'Ativar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opcoes).toEqual([{ senha: 'segredo' }])
    expect(cadastros).toEqual([{ desafioId: ID_A, nome: 'Celular da Ana', resposta }])
    expect(lerAparelho()).toEqual({ email: 'ana@clube.test', passkey: true })
    expect(await screen.findByText('Chrome no Android')).toBeInTheDocument()
  })

  it('senha errada (422) mostra "Senha incorreta." no painel, que continua aberto, e a sessão segue', async () => {
    servidor.use(listaDe([]), http.post('/api/eu/passkeys/opcoes', () => erroDaApi(422, 'REGRA', 'Senha incorreta.')))
    renderizarRotas(rotas, '/conta')
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar neste aparelho' }))
    const painel = await screen.findByRole('dialog')
    await userEvent.type(within(painel).getByLabelText('Sua senha'), 'errada')
    await userEvent.click(within(painel).getByRole('button', { name: 'Ativar' }))

    expect(await within(painel).findByText('Senha incorreta.')).toBeInTheDocument()
    expect(navegador.startRegistration).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Minha conta' })).toBeInTheDocument()
  })

  it('cancelar no celular não mostra erro e nada é gravado', async () => {
    const cadastros: unknown[] = []
    servidor.use(
      listaDe([]),
      http.post('/api/eu/passkeys/opcoes', () => HttpResponse.json({ desafioId: ID_A, opcoes: opcoesDeCadastro })),
      http.post('/api/eu/passkeys', async ({ request }) => {
        cadastros.push(await request.json())
        return HttpResponse.json(minhas[0], { status: 201 })
      }),
    )
    navegador.startRegistration.mockRejectedValue(Object.assign(new Error('cancelou'), { name: 'NotAllowedError' }))
    renderizarRotas(rotas, '/conta')
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar neste aparelho' }))
    const painel = await screen.findByRole('dialog')
    await userEvent.type(within(painel).getByLabelText('Sua senha'), 'segredo')
    await userEvent.click(within(painel).getByRole('button', { name: 'Ativar' }))

    await waitFor(() => expect(navegador.startRegistration).toHaveBeenCalled())
    await waitFor(() => expect(within(painel).getByRole('button', { name: 'Ativar' })).toBeEnabled())
    expect(within(painel).queryByRole('alert')).not.toBeInTheDocument()
    expect(cadastros).toEqual([])
    expect(lerAparelho()).toEqual({})
  })

  it('"Esquecer este aparelho" apaga a marca e o e-mail, sem tocar nas digitais do servidor', async () => {
    localStorage.setItem('desbravadores:aparelho', JSON.stringify({ email: 'ana@clube.test', passkey: true }))
    const removidas: string[] = []
    servidor.use(
      listaDe(minhas),
      http.delete('/api/eu/passkeys/:id', ({ params }) => {
        removidas.push(String(params['id']))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderizarRotas(rotas, '/conta')
    await userEvent.click(await (await cartao()).findByRole('button', { name: 'Esquecer este aparelho' }))

    expect(lerAparelho()).toEqual({})
    expect(screen.queryByRole('button', { name: 'Esquecer este aparelho' })).not.toBeInTheDocument()
    expect(removidas).toEqual([])
  })
})
