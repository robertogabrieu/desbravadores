import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { CLASSE_AMIGO, criarPerfil, handlerErroPerfil, handlerPerfil } from '../../testes/handlers/perfil'
import { handlerProgressoDbv } from '../../testes/handlers/progresso'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasPerfil } from './rotas'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
})

const ID = '00000000-0000-4000-8000-000000000201'

function abrir() {
  servidor.use(handlerProgressoDbv(), ...handlersSessao([criarVinculo('CONSELHEIRO')]))
  return renderizarRotas(rotasPerfil, `/dbv/${ID}`)
}

describe('perfil do DBV', () => {
  it('mostra nome, idade, unidade, classe, posição, pontos e frequência do mês', async () => {
    servidor.use(handlerPerfil())
    abrir()
    expect(await screen.findByRole('heading', { name: 'Ana Clara Souza' })).toBeInTheDocument()
    expect(screen.getByText('11 anos · Águias')).toBeInTheDocument()
    expect(screen.getByText('Classe Companheiro')).toBeInTheDocument()
    expect(screen.getByText('no ranking').previousSibling).toHaveTextContent('1º')
    expect(screen.getByText('pontos').previousSibling).toHaveTextContent('446')
    expect(screen.getByText('frequência').previousSibling).toHaveTextContent('94%')
  })

  it('lista as classes investidas; sem especialidades nem instrutor (a seção de progresso tem os próprios testes)', async () => {
    servidor.use(handlerPerfil())
    abrir()
    await screen.findByRole('heading', { name: 'Ana Clara Souza' })
    expect(screen.getByText(CLASSE_AMIGO.nome)).toBeInTheDocument()
    expect(screen.getByText('Investida em 2029')).toBeInTheDocument()
    expect(screen.queryByText(/Especialidades/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Instrutor/i)).not.toBeInTheDocument()
  })

  it('sem posição, sem frequência e sem classe: traços e nada de inventado', async () => {
    const base = criarPerfil()
    servidor.use(
      handlerPerfil({ ...base, posicaoMes: null, frequenciaMes: null, classesInvestidas: [], dbv: { ...base.dbv, classeAtual: null, unidade: null } }),
    )
    abrir()
    await screen.findByRole('heading', { name: 'Ana Clara Souza' })
    expect(screen.getByText('no ranking').previousSibling).toHaveTextContent('—')
    expect(screen.getByText('frequência').previousSibling).toHaveTextContent('—')
    expect(screen.getByText('11 anos · Sem unidade')).toBeInTheDocument()
    expect(screen.getByText('Sem classe atual')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma classe investida ainda.')).toBeInTheDocument()
  })

  it('contato só aparece quando a API envia', async () => {
    const base = criarPerfil()
    servidor.use(handlerPerfil({ ...base, dbv: { ...base.dbv, contato: { responsavelNome: 'Maria Souza', responsavelTelefone: '11999990000', responsavelEmail: null } } }))
    abrir()
    expect(await screen.findByText('Contato do responsável')).toBeInTheDocument()
    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
    expect(screen.getByText(/11999990000/)).toBeInTheDocument()
  })

  it('sem contato na resposta: nenhuma seção de contato', async () => {
    servidor.use(handlerPerfil())
    abrir()
    await screen.findByRole('heading', { name: 'Ana Clara Souza' })
    expect(screen.queryByText('Contato do responsável')).not.toBeInTheDocument()
  })

  it('"Voltar" leva à tela anterior do histórico', async () => {
    servidor.use(handlerPerfil(), ...handlersSessao([criarVinculo('CONSELHEIRO')]))
    const { roteador } = renderizarRotas([{ path: '/ranking', element: <p>tela do ranking</p> }, ...rotasPerfil], '/ranking')
    await roteador.navigate(`/dbv/${ID}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(await screen.findByText('tela do ranking')).toBeInTheDocument()
  })

  it('o Adm em /dbv/:id vai para a ficha do desbravador no painel', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]), handlerPerfil(), handlerProgressoDbv())
    const { roteador } = renderizarRotas([...rotasPerfil, { path: '/adm/desbravadores/:id', element: <p>ficha do adm</p> }], `/dbv/${ID}`)
    expect(await screen.findByText('ficha do adm')).toBeInTheDocument()
    expect(roteador.state.location.pathname).toBe(`/adm/desbravadores/${ID}`)
  })

  it('carregando: esqueleto acessível', async () => {
    servidor.use(http.get('/api/desbravadores/:id/perfil', async () => new Promise<Response>(() => {})))
    abrir()
    expect(await screen.findByRole('status', { name: 'Carregando o perfil' })).toBeInTheDocument()
  })

  it('erro da API (fora do escopo): mostra a mensagem e "Tentar de novo" busca outra vez', async () => {
    servidor.use(handlerErroPerfil(403, { codigo: 'SEM_PERMISSAO', mensagem: 'Você não pode ver este perfil.' }))
    abrir()
    expect(await screen.findByText('Você não pode ver este perfil.')).toBeInTheDocument()
    servidor.use(handlerPerfil())
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { name: 'Ana Clara Souza' })).toBeInTheDocument()
  })

  it('não encontrado: mensagem da API', async () => {
    servidor.use(http.get('/api/desbravadores/:id/perfil', () => HttpResponse.json({ codigo: 'NAO_ENCONTRADO', mensagem: 'Desbravador não encontrado.' }, { status: 404 })))
    abrir()
    expect(await screen.findByText('Desbravador não encontrado.')).toBeInTheDocument()
  })

  it('sem conexão e sem dado guardado: "Disponível quando houver internet"', async () => {
    offline.modo = 'SEM_CONEXAO'
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})
