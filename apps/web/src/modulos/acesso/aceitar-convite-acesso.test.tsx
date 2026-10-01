import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import type { RouteObject } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import {
  TOKEN_CONVITE_ACESSO,
  criarConvitePublico,
  handlerAceitarConviteAcesso,
  handlerConvitePublico,
  handlerConvitePublicoVencido,
} from '../../testes/handlers/convite-acesso'
import { criarEu, criarVinculo, handlerSemSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasAcessoPublicas } from './rotas'

const rotas: RouteObject[] = [{ path: '/', element: <p>raiz</p> }, ...rotasAcessoPublicas]
const URL_DO_CONVITE = `/acesso/${TOKEN_CONVITE_ACESSO}`
const euDepoisDeEntrar = () => http.get('/api/eu', () => HttpResponse.json(criarEu([criarVinculo('CONSELHEIRO')])))

async function preencher(email: string, confirmacaoEmail: string, senha = 'senha-nova-123', confirmacao = senha) {
  await userEvent.type(await screen.findByLabelText('E-mail'), email)
  await userEvent.type(screen.getByLabelText('Confirme o e-mail'), confirmacaoEmail)
  await userEvent.type(screen.getByLabelText('Senha'), senha)
  await userEvent.type(screen.getByLabelText('Confirme a senha'), confirmacao)
}

describe('aceitar convite de acesso por link', () => {
  it('mostra quem convidou e para quê; e-mail novo cria o acesso e entra', async () => {
    const recebidos: unknown[] = []
    servidor.use(handlerSemSessao(), handlerConvitePublico(), handlerAceitarConviteAcesso(recebidos), euDepoisDeEntrar())
    const { roteador } = renderizarRotas(rotas, URL_DO_CONVITE)
    expect(
      await screen.findByText('O Clube Órion convidou você, Paulo Henrique Souza, para ser conselheiro da unidade Águias.'),
    ).toBeInTheDocument()
    await preencher('Paulo@Exemplo.org', 'paulo@exemplo.org')
    await userEvent.click(screen.getByRole('button', { name: 'Criar meu acesso' }))
    await screen.findByText('raiz')
    expect(roteador.state.location.pathname).toBe('/')
    expect(recebidos).toEqual([{ email: 'paulo@exemplo.org', senha: 'senha-nova-123' }])
  })

  it('confirmação de e-mail que não bate não envia', async () => {
    const recebidos: unknown[] = []
    servidor.use(handlerSemSessao(), handlerConvitePublico(), handlerAceitarConviteAcesso(recebidos))
    renderizarRotas(rotas, URL_DO_CONVITE)
    await preencher('paulo@exemplo.org', 'paulo@exemplo.com')
    await userEvent.click(screen.getByRole('button', { name: 'Criar meu acesso' }))
    expect(await screen.findByText('Os e-mails não são iguais')).toBeInTheDocument()
    expect(recebidos).toEqual([])
  })

  it('e-mail que já tem conta: pede a senha que a pessoa usa e entra com ela', async () => {
    const recebidos: unknown[] = []
    servidor.use(
      handlerSemSessao(),
      handlerConvitePublico(criarConvitePublico({ papel: 'INSTRUTOR', unidades: [], classes: [{ id: uuid(101), nome: 'Amigo', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: '--x' }] })),
      handlerAceitarConviteAcesso(recebidos, 'senha-de-sempre'),
      euDepoisDeEntrar(),
    )
    const { roteador } = renderizarRotas(rotas, URL_DO_CONVITE)
    expect(await screen.findByText(/para ser instrutor de Amigo\./)).toBeInTheDocument()
    await preencher('ana@exemplo.org', 'ana@exemplo.org')
    await userEvent.click(screen.getByRole('button', { name: 'Criar meu acesso' }))
    expect(await screen.findByText('Você já tem conta. Digite a senha que você usa.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Confirme a senha')).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Senha'), 'senha-errada')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar e aceitar o convite' }))
    expect(await screen.findByText('E-mail ou senha incorretos')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Senha'))
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-de-sempre')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar e aceitar o convite' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/'))
    expect(recebidos).toEqual([
      { email: 'ana@exemplo.org', senha: 'senha-nova-123' },
      { email: 'ana@exemplo.org', senha: 'senha-errada' },
      { email: 'ana@exemplo.org', senha: 'senha-de-sempre' },
    ])
  })

  it('convite inválido mostra o aviso e nenhum formulário', async () => {
    servidor.use(handlerSemSessao(), handlerConvitePublicoVencido())
    renderizarRotas(rotas, URL_DO_CONVITE)
    expect(await screen.findByText('Este convite não vale mais. Peça um novo ao Adm do clube.')).toBeInTheDocument()
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument()
  })

  it('convite que vence no envio mostra o mesmo aviso', async () => {
    servidor.use(
      handlerSemSessao(),
      handlerConvitePublico(),
      http.post('/api/acesso/:token', () => HttpResponse.json({ codigo: 'TOKEN_INVALIDO', mensagem: 'x' }, { status: 410 })),
    )
    renderizarRotas(rotas, URL_DO_CONVITE)
    await preencher('paulo@exemplo.org', 'paulo@exemplo.org')
    await userEvent.click(screen.getByRole('button', { name: 'Criar meu acesso' }))
    expect(await screen.findByText('Este convite não vale mais. Peça um novo ao Adm do clube.')).toBeInTheDocument()
  })

  it('carregando mostra o aviso de carga', async () => {
    servidor.use(
      handlerSemSessao(),
      http.get('/api/acesso/:token', async () => {
        await delay(200)
        return HttpResponse.json(criarConvitePublico())
      }),
    )
    renderizarRotas(rotas, URL_DO_CONVITE)
    expect(await screen.findByRole('status', { name: 'Carregando convite' })).toBeInTheDocument()
  })

  it('sem conexão diz que precisa de internet', async () => {
    servidor.use(handlerSemSessao(), http.get('/api/acesso/:token', () => HttpResponse.error()))
    renderizarRotas(rotas, URL_DO_CONVITE)
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})
