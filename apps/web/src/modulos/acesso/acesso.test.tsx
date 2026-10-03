import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { TOKEN_VALIDO, handlerAceitarConvite, handlerConviteVencido, handlerEsqueci, handlerEsqueciRecusado, handlerEsqueciSemRede, handlerPapelAtivoRecusado, handlerLogin, handlerLoginRecusado, handlerPapelAtivo, handlerRedefinir, handlerRedefinirVencido } from '../../testes/handlers/auth'
import { criarEu, criarSessao, criarVinculo, handlerSemSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { GuardaRota } from '../../sessao/GuardaRota'
import { RedirecionamentoRaiz } from '../../sessao/RedirecionamentoRaiz'
import { rotasAcessoPapel, rotasAcessoPublicas } from './rotas'
import type { RouteObject } from 'react-router-dom'

const rotas: RouteObject[] = [
  { path: '/', element: <p>raiz</p> },
  ...rotasAcessoPublicas,
  ...rotasAcessoPapel,
]

/** Depois de entrar, /api/eu passa a devolver o usuário (antes disso o refresh recusa). */
function sessaoAposEntrar(vinculos = [criarVinculo('CONSELHEIRO')], ativo: string | null = vinculos[0]?.id ?? null) {
  return [http.get('/api/eu', () => HttpResponse.json(criarEu(vinculos, ativo))), criarSessao(vinculos, ativo)] as const
}

describe('login', () => {
  it('entra e vai para a raiz', async () => {
    const [eu, sessao] = sessaoAposEntrar()
    const recebidos: unknown[] = []
    servidor.use(handlerSemSessao(), eu, handlerLogin(sessao, recebidos))
    const { roteador } = renderizarRotas(rotas, '/login')
    await userEvent.type(await screen.findByLabelText('E-mail'), 'Ana@Clube.test')
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await screen.findByText('raiz')
    expect(roteador.state.location.pathname).toBe('/')
    expect(recebidos).toEqual([{ email: 'ana@clube.test', senha: 'segredo' }])
  })

  it('sem vínculo escolhido, a raiz leva a /papel', async () => {
    const vinculos = [criarVinculo('CONSELHEIRO', 1), criarVinculo('INSTRUTOR', 2)]
    const [eu, sessao] = sessaoAposEntrar(vinculos, null)
    servidor.use(handlerSemSessao(), eu, handlerLogin(sessao))
    const { roteador } = renderizarRotas([{ path: '/', element: <RedirecionamentoRaiz /> }, ...rotas.slice(1)], '/login')
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@clube.test')
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/papel'))
  })

  it.each([
    [401, 'CREDENCIAIS'],
    [429, 'LIMITE_EXCEDIDO'],
    [500, 'ERRO_INTERNO'],
  ])('falha %i mostra a mensagem única', async (status, codigo) => {
    servidor.use(handlerSemSessao(), handlerLoginRecusado(status, codigo))
    renderizarRotas(rotas, '/login')
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@clube.test')
    await userEvent.type(screen.getByLabelText('Senha'), 'errada')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('E-mail ou senha incorretos')).toBeInTheDocument()
  })

  it('valida os campos com o contrato antes de enviar', async () => {
    servidor.use(handlerSemSessao())
    renderizarRotas(rotas, '/login')
    await userEvent.type(await screen.findByLabelText('E-mail'), 'sem-arroba')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('E-mail inválido')).toBeInTheDocument()
  })

  it('tem link para esqueci a senha e não tem botão de ranking', async () => {
    servidor.use(handlerSemSessao())
    renderizarRotas(rotas, '/login')
    expect(await screen.findByRole('link', { name: 'Esqueci minha senha' })).toHaveAttribute('href', '/senha/esqueci')
    expect(screen.queryByText(/ver ranking/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Entrar como')).not.toBeInTheDocument()
  })
})

describe('convite', () => {
  it('define a senha, entra e vai para a raiz', async () => {
    const [eu, sessao] = sessaoAposEntrar()
    const recebidos: unknown[] = []
    servidor.use(handlerSemSessao(), eu, handlerAceitarConvite(sessao, recebidos))
    const { roteador } = renderizarRotas(rotas, `/convite/${TOKEN_VALIDO}`)
    await userEvent.type(await screen.findByLabelText('Senha'), 'senha-nova-123')
    await userEvent.type(screen.getByLabelText('Confirme a senha'), 'senha-nova-123')
    await userEvent.click(screen.getByRole('button', { name: 'Definir senha' }))
    await screen.findByText('raiz')
    expect(roteador.state.location.pathname).toBe('/')
    expect(recebidos).toEqual([{ token: TOKEN_VALIDO, senha: 'senha-nova-123' }])
  })

  it('confirmação diferente e senha curta não enviam', async () => {
    const recebidos: unknown[] = []
    servidor.use(handlerSemSessao(), handlerAceitarConvite(criarSessao([criarVinculo('ADM')]), recebidos))
    renderizarRotas(rotas, `/convite/${TOKEN_VALIDO}`)
    await userEvent.type(await screen.findByLabelText('Senha'), 'curta')
    await userEvent.type(screen.getByLabelText('Confirme a senha'), 'outra')
    await userEvent.click(screen.getByRole('button', { name: 'Definir senha' }))
    expect(await screen.findByText('A senha precisa ter pelo menos 8 caracteres')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Senha'))
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-nova-123')
    await userEvent.click(screen.getByRole('button', { name: 'Definir senha' }))
    expect(await screen.findByText('As senhas não são iguais')).toBeInTheDocument()
    expect(recebidos).toEqual([])
  })

  it('token vencido (410) mostra o aviso', async () => {
    servidor.use(handlerSemSessao(), handlerConviteVencido())
    renderizarRotas(rotas, `/convite/${TOKEN_VALIDO}`)
    await userEvent.type(await screen.findByLabelText('Senha'), 'senha-nova-123')
    await userEvent.type(screen.getByLabelText('Confirme a senha'), 'senha-nova-123')
    await userEvent.click(screen.getByRole('button', { name: 'Definir senha' }))
    expect(await screen.findByText('Este convite não vale mais. Peça um novo ao Adm do clube.')).toBeInTheDocument()
  })
})

describe('convite com token cortado', () => {
  it('400 mostra a mesma mensagem do convite vencido', async () => {
    servidor.use(handlerSemSessao(), handlerConviteVencido(400))
    renderizarRotas(rotas, '/convite/cortado')
    await userEvent.type(await screen.findByLabelText('Senha'), 'senha-nova-123')
    await userEvent.type(screen.getByLabelText('Confirme a senha'), 'senha-nova-123')
    await userEvent.click(screen.getByRole('button', { name: 'Definir senha' }))
    expect(await screen.findByText('Este convite não vale mais. Peça um novo ao Adm do clube.')).toBeInTheDocument()
    expect(screen.queryByText('Requisição inválida.')).not.toBeInTheDocument()
  })
})

describe('esqueci a senha', () => {
  it('sempre responde a mesma frase', async () => {
    const recebidos: unknown[] = []
    servidor.use(handlerSemSessao(), handlerEsqueci(recebidos))
    renderizarRotas(rotas, '/senha/esqueci')
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@clube.test')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
    expect(await screen.findByText('Se o e-mail estiver cadastrado, enviamos um link.')).toBeInTheDocument()
    expect(recebidos).toEqual([{ email: 'ana@clube.test' }])
  })

  it('429 mostra a mensagem da API, não a frase de sucesso', async () => {
    servidor.use(handlerSemSessao(), handlerEsqueciRecusado(429, 'LIMITE_EXCEDIDO', 'Muitas tentativas. Espere um pouco.'))
    renderizarRotas(rotas, '/senha/esqueci')
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@clube.test')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
    expect(await screen.findByText('Muitas tentativas. Espere um pouco.')).toBeInTheDocument()
    expect(screen.queryByText('Se o e-mail estiver cadastrado, enviamos um link.')).not.toBeInTheDocument()
  })

  it('erro de rede mostra "Sem conexão", não a frase de sucesso', async () => {
    servidor.use(handlerSemSessao(), handlerEsqueciSemRede())
    renderizarRotas(rotas, '/senha/esqueci')
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@clube.test')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
    expect(await screen.findByText(/Sem conexão/)).toBeInTheDocument()
    expect(screen.queryByText('Se o e-mail estiver cadastrado, enviamos um link.')).not.toBeInTheDocument()
  })

  it('e-mail inválido não envia', async () => {
    servidor.use(handlerSemSessao())
    renderizarRotas(rotas, '/senha/esqueci')
    await userEvent.type(await screen.findByLabelText('E-mail'), 'xx')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
    expect(await screen.findByText('E-mail inválido')).toBeInTheDocument()
  })
})

describe('redefinir senha', () => {
  it('ao salvar vai ao login', async () => {
    const recebidos: unknown[] = []
    servidor.use(handlerSemSessao(), handlerRedefinir(recebidos))
    const { roteador } = renderizarRotas(rotas, `/senha/redefinir/${TOKEN_VALIDO}`)
    await userEvent.type(await screen.findByLabelText('Senha'), 'senha-nova-123')
    await userEvent.type(screen.getByLabelText('Confirme a senha'), 'senha-nova-123')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/login'))
    expect(recebidos).toEqual([{ token: TOKEN_VALIDO, senha: 'senha-nova-123' }])
  })

  it.each([410, 400])('token inválido (%i) mostra o aviso do link e leva a pedir outro', async (status) => {
    servidor.use(handlerSemSessao(), handlerRedefinirVencido(status))
    renderizarRotas(rotas, `/senha/redefinir/${TOKEN_VALIDO}`)
    await userEvent.type(await screen.findByLabelText('Senha'), 'senha-nova-123')
    await userEvent.type(screen.getByLabelText('Confirme a senha'), 'senha-nova-123')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }))
    expect(await screen.findByText('Este link não vale mais. Peça um novo.')).toBeInTheDocument()
    expect(screen.queryByText(/convite/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pedir outro link' })).toHaveAttribute('href', '/senha/esqueci')
  })
})

describe('escolher papel', () => {
  it('mostra um cartão por vínculo e escolhe pelo clicado', async () => {
    const vinculos = [
      criarVinculo('CONSELHEIRO', 1, { unidades: [{ id: '00000000-0000-4000-8000-000000000101', nome: 'Águias' }] }),
      criarVinculo('INSTRUTOR', 2, {
        classes: [{ id: '00000000-0000-4000-8000-000000000102', nome: 'Amigo', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: '--classe-amigo' }],
      }),
    ]
    const recebidos: unknown[] = []
    servidor.use(
      http.get('/api/eu', () => HttpResponse.json(criarEu(vinculos, null))),
      http.post('/api/auth/refresh', () => HttpResponse.json(criarSessao(vinculos, null))),
      handlerPapelAtivo(criarSessao(vinculos, vinculos[1]?.id), recebidos),
    )
    renderizarRotas(rotas, '/papel')
    expect(await screen.findByText('Águias')).toBeInTheDocument()
    expect(screen.getByText('Amigo')).toBeInTheDocument()
    expect(screen.getAllByText('Clube Teste')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: /Instrutor/ }))
    await waitFor(() => expect(recebidos).toEqual([{ vinculoId: vinculos[1]?.id }]))
  })

  it('papel-ativo recusado mostra o erro e não sai da tela', async () => {
    const vinculos = [criarVinculo('CONSELHEIRO', 1), criarVinculo('INSTRUTOR', 2)]
    servidor.use(
      http.get('/api/eu', () => HttpResponse.json(criarEu(vinculos, null))),
      http.post('/api/auth/refresh', () => HttpResponse.json(criarSessao(vinculos, null))),
      handlerPapelAtivoRecusado(),
    )
    const { roteador } = renderizarRotas(rotas, '/papel')
    await userEvent.click(await screen.findByRole('button', { name: /Instrutor/ }))
    expect(await screen.findByText('Não foi possível trocar de papel. Tente de novo.')).toBeInTheDocument()
    expect(roteador.state.location.pathname).toBe('/papel')
  })

  it('abrir o app sem papel em clube nenhum (refresh recusado por papel inativo): login com o aviso', async () => {
    servidor.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ codigo: 'VINCULO_INATIVO', mensagem: 'Sem vínculo ativo.' }, { status: 403 })),
    )
    const comGuarda: RouteObject[] = [...rotasAcessoPublicas, { element: <GuardaRota semVinculo />, children: rotasAcessoPapel }]
    const { roteador } = renderizarRotas(comGuarda, '/papel')
    expect(await screen.findByText('Você não tem mais acesso a nenhum clube.')).toHaveAttribute('role', 'status')
    expect(roteador.state.location.pathname).toBe('/login')
    expect(screen.queryByText('Como você quer entrar?')).not.toBeInTheDocument()
  })

  it('sessão que perde todos os papéis durante o uso: termina e o login mostra o aviso, sem a escolha de papel', async () => {
    const saidas: string[] = []
    servidor.use(
      http.post('/api/auth/logout', () => {
        saidas.push('logout')
        return new HttpResponse(null, { status: 204 })
      }),
      http.get('/api/eu', () => HttpResponse.json(criarEu([], null))),
      http.post('/api/auth/refresh', () => HttpResponse.json(criarSessao([criarVinculo('CONSELHEIRO')]))),
    )
    const comGuarda: RouteObject[] = [...rotasAcessoPublicas, { element: <GuardaRota semVinculo />, children: rotasAcessoPapel }]
    const { roteador } = renderizarRotas(comGuarda, '/papel')
    expect(await screen.findByText('Você não tem mais acesso a nenhum clube.')).toHaveAttribute('role', 'status')
    expect(roteador.state.location.pathname).toBe('/login')
    expect(screen.queryByText('Como você quer entrar?')).not.toBeInTheDocument()
    await waitFor(() => expect(saidas).toEqual(['logout']))
  })
})

describe('login com aviso no estado', () => {
  it('mostra o aviso como status acima do formulário', async () => {
    servidor.use(handlerSemSessao())
    const { roteador } = renderizarRotas(rotas, '/login')
    await screen.findByLabelText('E-mail')
    await roteador.navigate('/login', { replace: true, state: { aviso: 'Você não tem mais acesso a nenhum clube.' } })
    const aviso = await screen.findByRole('status')
    expect(aviso).toHaveTextContent('Você não tem mais acesso a nenhum clube.')
    expect(aviso.compareDocumentPosition(screen.getByLabelText('E-mail')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('o aviso aparece uma vez: o estado do histórico fica sem ele', async () => {
    servidor.use(handlerSemSessao())
    const { roteador } = renderizarRotas(rotas, '/login')
    await screen.findByLabelText('E-mail')
    await roteador.navigate('/login', { replace: true, state: { aviso: 'Você não tem mais acesso a nenhum clube.' } })
    expect(await screen.findByRole('status')).toHaveTextContent('Você não tem mais acesso a nenhum clube.')
    await waitFor(() => expect(roteador.state.location.state ?? {}).not.toHaveProperty('aviso'))
    expect(screen.getByRole('status')).toHaveTextContent('Você não tem mais acesso a nenhum clube.')
  })

  it('sem aviso no estado não mostra status', async () => {
    servidor.use(handlerSemSessao())
    renderizarRotas(rotas, '/login')
    await screen.findByLabelText('E-mail')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
