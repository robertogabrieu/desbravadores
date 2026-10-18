import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { RouteObject } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GuardaRota } from '../../sessao/GuardaRota'
import { erroDaApi, handlerLogin } from '../../testes/handlers/auth'
import { TOKEN_CONVITE_ACESSO, handlerAceitarConviteAcesso, handlerConvitePublico } from '../../testes/handlers/convite-acesso'
import { criarEu, criarSessao, criarVinculo, handlerSemSessao, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasAcessoPapel, rotasAcessoPublicas } from '../acesso/rotas'
import { guardarSenhaDoConvite, lerAparelho, lerSenhaDoConvite } from './aparelho'

const navegador = vi.hoisted(() => ({ startRegistration: vi.fn(), startAuthentication: vi.fn() }))
vi.mock('@simplewebauthn/browser', () => navegador)

const UMA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000
const rotas: RouteObject[] = [
  { path: '/', element: <p>raiz</p> },
  ...rotasAcessoPublicas,
  { element: <GuardaRota semVinculo />, children: rotasAcessoPapel },
]

const opcoesDeLogin = { challenge: 'desafio', rpId: 'localhost' }
const opcoesDeCadastro = {
  challenge: 'desafio',
  rp: { name: 'Desbravadores' },
  user: { id: 'u', name: 'ana@clube.test', displayName: 'Ana' },
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
}
const respostaDeLogin = {
  id: 'cred',
  rawId: 'cred',
  type: 'public-key',
  response: { clientDataJSON: 'a', authenticatorData: 'b', signature: 'c' },
  clientExtensionResults: {},
}
const respostaDeCadastro = {
  id: 'cred',
  rawId: 'cred',
  type: 'public-key',
  response: { clientDataJSON: 'a', attestationObject: 'b' },
  clientExtensionResults: {},
}
const DESAFIO_ID = '00000000-0000-4000-8000-0000000000aa'

const vinculos = [criarVinculo('CONSELHEIRO')]
const depoisDeEntrar = () => [http.get('/api/eu', () => HttpResponse.json(criarEu(vinculos)))]
const cancelamento = () => Object.assign(new Error('cancelou'), { name: 'NotAllowedError' })

interface Chamadas {
  opcoesDeLogin: number
  login: unknown[]
  opcoesDeCadastro: unknown[]
  cadastro: unknown[]
  refresh: number
}

/** Rotas de passkey do servidor, contando o que chega. */
function servidorDePasskey(): Chamadas {
  const chamadas: Chamadas = { opcoesDeLogin: 0, login: [], opcoesDeCadastro: [], cadastro: [], refresh: 0 }
  servidor.use(
    http.post('/api/auth/refresh', () => {
      chamadas.refresh += 1
      return HttpResponse.json({ codigo: 'NAO_AUTENTICADO', mensagem: 'Sessão expirada' }, { status: 401 })
    }),
    http.post('/api/auth/passkey/login/opcoes', () => {
      chamadas.opcoesDeLogin += 1
      return HttpResponse.json({ desafioId: DESAFIO_ID, opcoes: opcoesDeLogin })
    }),
    http.post('/api/eu/passkeys/opcoes', async ({ request }) => {
      chamadas.opcoesDeCadastro.push(await request.json())
      return HttpResponse.json({ desafioId: DESAFIO_ID, opcoes: opcoesDeCadastro })
    }),
    http.post('/api/eu/passkeys', async ({ request }) => {
      chamadas.cadastro.push(await request.json())
      return HttpResponse.json({ id: DESAFIO_ID, nome: 'Este aparelho', criadoEm: '2026-10-18T12:00:00.000Z', ultimoUsoEm: null }, { status: 201 })
    }),
  )
  return chamadas
}

const marcarAparelho = (conteudo: object) => localStorage.setItem('desbravadores:aparelho', JSON.stringify(conteudo))

beforeEach(() => {
  localStorage.clear()
  navegador.startAuthentication.mockReset()
  navegador.startRegistration.mockReset()
  vi.stubGlobal('PublicKeyCredential', class {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('login: aparelho com a marca', () => {
  beforeEach(() => marcarAparelho({ email: 'ana@clube.test', passkey: true }))

  it('abre com o e-mail lembrado, a digital como botão principal e sem o campo de senha', async () => {
    servidor.use(handlerSemSessao())
    renderizarRotas(rotas, '/login')

    expect(await screen.findByLabelText('E-mail')).toHaveValue('ana@clube.test')
    expect(screen.getByRole('button', { name: 'Entrar com digital ou rosto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Usar senha' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Esquecer este aparelho' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument()
    expect(navegador.startAuthentication).not.toHaveBeenCalled()
  })

  it('"Usar senha" mostra o campo e o botão Entrar, e os dois atalhos continuam à vista', async () => {
    servidor.use(handlerSemSessao())
    renderizarRotas(rotas, '/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Usar senha' }))

    expect(screen.getByLabelText('Senha')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Esquecer este aparelho' })).toBeInTheDocument()
  })

  it('entra pela digital, vai à raiz e não oferece o convite', async () => {
    const chamadas = servidorDePasskey()
    servidor.use(
      ...depoisDeEntrar(),
      http.post('/api/auth/passkey/login', async ({ request }) => {
        chamadas.login.push(await request.json())
        return HttpResponse.json(criarSessao(vinculos))
      }),
    )
    navegador.startAuthentication.mockResolvedValue(respostaDeLogin)
    const { roteador } = renderizarRotas(rotas, '/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar com digital ou rosto' }))

    await screen.findByText('raiz')
    expect(roteador.state.location.pathname).toBe('/')
    expect(navegador.startAuthentication).toHaveBeenCalledWith({ optionsJSON: opcoesDeLogin })
    expect(chamadas.login).toEqual([{ desafioId: DESAFIO_ID, resposta: respostaDeLogin }])
  })

  it('cancelar no celular não diz nada, não chama o servidor e não apaga a marca', async () => {
    const chamadas = servidorDePasskey()
    navegador.startAuthentication.mockRejectedValue(cancelamento())
    renderizarRotas(rotas, '/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar com digital ou rosto' }))

    await waitFor(() => expect(navegador.startAuthentication).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar com digital ou rosto' })).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(chamadas.login).toEqual([])
    expect(lerAparelho()).toEqual({ email: 'ana@clube.test', passkey: true })
  })

  it('erro qualquer do navegador também fica calado', async () => {
    servidorDePasskey()
    navegador.startAuthentication.mockRejectedValue(new Error('o navegador falhou'))
    renderizarRotas(rotas, '/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar com digital ou rosto' }))

    await waitFor(() => expect(navegador.startAuthentication).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(lerAparelho().passkey).toBe(true)
  })

  it('servidor recusou: mostra a mensagem da API, foca a senha e não mexe na sessão nem na marca', async () => {
    const chamadas = servidorDePasskey()
    servidor.use(
      http.post('/api/auth/passkey/login', () => erroDaApi(401, 'CREDENCIAIS', 'Não foi possível entrar com a digital. Use sua senha.')),
    )
    navegador.startAuthentication.mockResolvedValue(respostaDeLogin)
    renderizarRotas(rotas, '/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar com digital ou rosto' }))

    expect(await screen.findByText('Não foi possível entrar com a digital. Use sua senha.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Senha')).toHaveFocus())
    // Só a abertura da tela renovou a sessão: o 401 da passkey é resposta, não sessão vencida.
    expect(chamadas.refresh).toBe(1)
    expect(lerAparelho().passkey).toBe(true)
  })

  it('"Esquecer este aparelho" apaga a marca e o e-mail e devolve o formulário de sempre', async () => {
    servidor.use(handlerSemSessao())
    renderizarRotas(rotas, '/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Esquecer este aparelho' }))

    expect(await screen.findByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@clube.test')
    expect(lerAparelho()).toEqual({})
    expect(screen.getByRole('button', { name: 'Entrar com digital ou rosto' })).toBeInTheDocument()
  })
})

describe('login: aparelho sem a marca', () => {
  it('mostra o formulário de sempre e a digital como botão secundário, se o aparelho suporta', async () => {
    servidor.use(handlerSemSessao())
    renderizarRotas(rotas, '/login')

    expect(await screen.findByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar com digital ou rosto' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Esquecer este aparelho' })).not.toBeInTheDocument()
  })

  it('aparelho sem suporte não ganha o botão', async () => {
    vi.unstubAllGlobals()
    servidor.use(handlerSemSessao())
    renderizarRotas(rotas, '/login')

    await screen.findByLabelText('Senha')
    expect(screen.queryByRole('button', { name: 'Entrar com digital ou rosto' })).not.toBeInTheDocument()
  })

  it('funciona sem localStorage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    servidor.use(handlerSemSessao())
    renderizarRotas(rotas, '/login')

    expect(await screen.findByLabelText('Senha')).toBeInTheDocument()
    expect(lerAparelho()).toEqual({})
  })
})

describe('convite depois do login por senha', () => {
  async function entrarComSenha(sessaoPronta = true) {
    const chamadas = servidorDePasskey()
    servidor.use(handlerLogin(criarSessao(vinculos)), ...(sessaoPronta ? depoisDeEntrar() : []))
    const resultado = renderizarRotas(rotas, '/login')
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@clube.test')
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    return { ...resultado, chamadas }
  }

  it('oferece a digital antes de seguir; Ativar usa a senha que acabou de ser digitada', async () => {
    navegador.startRegistration.mockResolvedValue(respostaDeCadastro)
    const { roteador, chamadas } = await entrarComSenha()

    expect(await screen.findByRole('heading', { name: 'Quer entrar com digital ou rosto da próxima vez?' })).toBeInTheDocument()
    expect(roteador.state.location.pathname).toBe('/digital/convite')
    await userEvent.click(screen.getByRole('button', { name: 'Ativar' }))

    await screen.findByText('raiz')
    expect(chamadas.opcoesDeCadastro).toEqual([{ senha: 'segredo' }])
    expect(chamadas.cadastro).toEqual([{ desafioId: DESAFIO_ID, nome: 'Este aparelho', resposta: respostaDeCadastro }])
    expect(lerAparelho()).toEqual({ email: 'ana@clube.test', passkey: true })
    expect(lerSenhaDoConvite()).toBeNull()
  })

  it('"Agora não" segue para o app e guarda a escolha; no próximo login por senha não pergunta', async () => {
    const { chamadas } = await entrarComSenha()
    await userEvent.click(await screen.findByRole('button', { name: 'Agora não' }))

    await screen.findByText('raiz')
    expect(lerAparelho().recusadoEm).toBeTypeOf('number')
    expect(lerSenhaDoConvite()).toBeNull()
    expect(chamadas.opcoesDeCadastro).toEqual([])
  })

  it('passados 30 dias do "Agora não", pergunta de novo', async () => {
    marcarAparelho({ recusadoEm: Date.now() - 31 * 24 * 60 * 60 * 1000 })
    await entrarComSenha()

    expect(await screen.findByRole('heading', { name: 'Quer entrar com digital ou rosto da próxima vez?' })).toBeInTheDocument()
  })

  it('antes de 30 dias do "Agora não", vai direto ao app', async () => {
    marcarAparelho({ recusadoEm: Date.now() - UMA_SEMANA_MS })
    await entrarComSenha()

    await screen.findByText('raiz')
    expect(lerSenhaDoConvite()).toBeNull()
  })

  it('aparelho que já tem a marca vai direto ao app, sem guardar a senha', async () => {
    marcarAparelho({ email: 'ana@clube.test', passkey: true })
    servidorDePasskey()
    servidor.use(handlerLogin(criarSessao(vinculos)), ...depoisDeEntrar())
    renderizarRotas(rotas, '/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Usar senha' }))
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await screen.findByText('raiz')
    expect(lerSenhaDoConvite()).toBeNull()
  })

  it('aparelho sem suporte vai direto ao app, sem guardar a senha', async () => {
    vi.unstubAllGlobals()
    await entrarComSenha()

    await screen.findByText('raiz')
    expect(lerSenhaDoConvite()).toBeNull()
  })

  it('se Ativar falhar (cancelou), segue para o app sem mensagem de erro', async () => {
    navegador.startRegistration.mockRejectedValue(cancelamento())
    await entrarComSenha()
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar' }))

    await screen.findByText('raiz')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(lerAparelho().passkey).toBeUndefined()
  })

  it('se o servidor recusar o cadastro, também segue para o app', async () => {
    navegador.startRegistration.mockResolvedValue(respostaDeCadastro)
    await entrarComSenha()
    servidor.use(http.post('/api/eu/passkeys', () => erroDaApi(500, 'ERRO_INTERNO', 'Falhou')))
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar' }))

    await screen.findByText('raiz')
    expect(lerAparelho().passkey).toBeUndefined()
  })
})

describe('convite depois do aceite de convite de acesso', () => {
  it('também oferece a digital, antes da escolha de papel', async () => {
    servidor.use(handlerSemSessao(), handlerConvitePublico(), handlerAceitarConviteAcesso([]), ...depoisDeEntrar())
    const { roteador } = renderizarRotas(rotas, `/acesso/${TOKEN_CONVITE_ACESSO}`)
    await userEvent.type(await screen.findByLabelText('E-mail'), 'paulo@exemplo.org')
    await userEvent.type(screen.getByLabelText('Confirme o e-mail'), 'paulo@exemplo.org')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-nova-123')
    await userEvent.type(screen.getByLabelText('Confirme a senha'), 'senha-nova-123')
    await userEvent.click(screen.getByRole('button', { name: 'Criar meu acesso' }))

    expect(await screen.findByRole('heading', { name: 'Quer entrar com digital ou rosto da próxima vez?' })).toBeInTheDocument()
    expect(roteador.state.location.pathname).toBe('/digital/convite')
  })
})

describe('convite com a senha vencida', () => {
  it('pede a senha, mostra "Senha incorreta." sem seguir e ativa com a certa', async () => {
    const chamadas = servidorDePasskey()
    servidor.use(...handlersSessao(vinculos), http.post('/api/eu/passkeys/opcoes', async ({ request }) => {
      const { senha } = (await request.json()) as { senha: string }
      if (senha === 'errada') return erroDaApi(422, 'REGRA', 'Senha incorreta.')
      chamadas.opcoesDeCadastro.push({ senha })
      return HttpResponse.json({ desafioId: DESAFIO_ID, opcoes: opcoesDeCadastro })
    }))
    navegador.startRegistration.mockResolvedValue(respostaDeCadastro)
    guardarSenhaDoConvite('antiga', Date.now() - 6 * 60 * 1000)
    const { roteador } = renderizarRotas(rotas, '/digital/convite')
    await userEvent.click(await screen.findByRole('button', { name: 'Ativar' }))

    const campo = await screen.findByLabelText('Digite sua senha para ativar')
    await userEvent.type(campo, 'errada')
    await userEvent.click(screen.getByRole('button', { name: 'Ativar' }))
    expect(await screen.findByText('Senha incorreta.')).toBeInTheDocument()
    expect(roteador.state.location.pathname).toBe('/digital/convite')

    await userEvent.clear(campo)
    await userEvent.type(campo, 'certa')
    await userEvent.click(screen.getByRole('button', { name: 'Ativar' }))
    await screen.findByText('raiz')
    expect(chamadas.opcoesDeCadastro).toEqual([{ senha: 'certa' }])
  })

  it('quem entra na rota sem precisar (aparelho já marcado) volta à raiz', async () => {
    marcarAparelho({ email: 'ana@clube.test', passkey: true })
    servidor.use(...handlersSessao(vinculos))
    renderizarRotas(rotas, '/digital/convite')

    await screen.findByText('raiz')
  })

  it('sem sessão, a rota leva ao login', async () => {
    servidor.use(handlerSemSessao())
    renderizarRotas(rotas, '/digital/convite')

    expect(await screen.findByLabelText('E-mail')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Quer entrar com digital ou rosto da próxima vez?' })).not.toBeInTheDocument()
  })
})
