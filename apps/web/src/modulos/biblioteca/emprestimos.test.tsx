import type { EmprestimosSaida, Papel } from '@desbravadores/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http } from 'msw'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { GuardaRota } from '../../sessao/GuardaRota'
import { criarCategoriaBiblioteca, criarItemFisico, handlerBiblioteca } from '../../testes/handlers/biblioteca'
import type { ChamadaDeEmprestimo, RecusaDaApi } from '../../testes/handlers/emprestimos'
import {
  criarDesbravadorParaEmprestimo,
  criarDetalheDoLivro,
  criarEmprestimos,
  criarExemplarDisponivel,
  criarExemplarEmprestado,
  criarLinhaDeEmprestimo,
  handlerBuscaDeDesbravadores,
  handlerDetalheDoLivro,
  handlerEmprestimos,
  handlersEscritaEmprestimos,
} from '../../testes/handlers/emprestimos'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { AbaEmprestimos } from './AbaEmprestimos'
import { DetalheDoLivro } from './DetalheDoLivro'
import { DialogoDevolver } from './DialogoDevolver'
import type { EmprestimoParaDevolver } from './DialogoDevolver'
import { DialogoEmprestar } from './DialogoEmprestar'
import type { ExemplarEscolhido } from './DialogoEmprestar'
import { TelaBiblioteca } from './TelaBiblioteca'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

const LIVRO = criarItemFisico(1, { nome: 'Amigo', descricao: 'Classe regular' })
const PERMISSOES_DO_ADM = ['biblioteca.gerenciar', 'biblioteca.emprestar']
const SEM_INTERNET = /precisa de internet/
let chamadas: ChamadaDeEmprestimo[] = []

function entrarComo(papel: Papel, permissoes: string[]) {
  servidor.use(...handlersSessao([criarVinculo(papel)], undefined, permissoes))
}

const rotasDoDetalhe = [
  {
    element: <GuardaRota />,
    children: [
      { path: '/adm/biblioteca/livros/:id', element: <DetalheDoLivro /> },
      { path: '/biblioteca/livros/:id', element: <DetalheDoLivro /> },
      { path: '/adm/biblioteca', element: <p>Estante do Adm</p> },
      { path: '/biblioteca', element: <p>Estante da diretoria</p> },
    ],
  },
]

const abrirDetalhe = (base: '/adm/biblioteca' | '/biblioteca' = '/adm/biblioteca') => renderizarRotas(rotasDoDetalhe, `${base}/livros/${LIVRO.id}`)

/** Amigo com três exemplares: 1 no prazo (Pedro), 2 livre e 3 atrasado (Beatriz, inativa). */
const exemplaresDoAmigo = () => [
  criarExemplarEmprestado(1),
  criarExemplarDisponivel(2),
  criarExemplarEmprestado(3, { desbravadorNome: 'Beatriz Nunes', desbravadorAtivo: false, emprestadoEm: '2026-10-05', devolverAte: '2026-10-19', situacao: 'ATRASADO', dias: 2 }),
]

const detalheDoAmigo = () =>
  criarDetalheDoLivro(exemplaresDoAmigo(), {
    jaDevolveram: [{ desbravadorId: uuid(1), desbravadorNome: 'Rafael Costa', unidade: 'Lobos', devolvidoEm: '2026-09-30' }],
  })

beforeEach(() => {
  estado.modo = 'ONLINE'
  chamadas = []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('detalhe do livro', () => {
  it('mostra o cabeçalho, cada exemplar com a situação e quem está com ele, e as ações do Adm', async () => {
    entrarComo('ADM', PERMISSOES_DO_ADM)
    servidor.use(handlerDetalheDoLivro(detalheDoAmigo()))
    abrirDetalhe()
    expect(await screen.findByRole('heading', { level: 1, name: 'Amigo' })).toBeInTheDocument()
    expect(screen.getByText('1 de 3 disponíveis')).toBeInTheDocument()
    const lista = within(screen.getAllByRole('list')[0])
    const [primeiro, segundo, terceiro] = lista.getAllByRole('listitem')
    expect(within(primeiro).getByText('Emprestado até 28/10')).toBeInTheDocument()
    expect(within(primeiro).getByText('Pedro Rocha')).toBeInTheDocument()
    expect(within(primeiro).getByText(/Leões/)).toBeInTheDocument()
    expect(within(primeiro).getByText(/Emprestado em 14\/10 · devolver até 28\/10/)).toBeInTheDocument()
    expect(within(segundo).getByText('Disponível')).toBeInTheDocument()
    expect(within(terceiro).getByText('Atrasado há 2 dias')).toBeInTheDocument()
    expect(within(terceiro).getByText('Beatriz Nunes (inativo)')).toBeInTheDocument()
    expect(within(primeiro).getByRole('button', { name: 'Devolver o exemplar 1' })).toBeInTheDocument()
    expect(within(segundo).getByRole('button', { name: 'Emprestar o exemplar 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Acrescentar exemplares' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Dar baixa no exemplar/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Dar baixa no exemplar 2' })).toBeInTheDocument()
  })

  it('"Quem já leu" lista quem devolveu, com a ajuda; sem devoluções diz que ninguém devolveu', async () => {
    entrarComo('ADM', PERMISSOES_DO_ADM)
    servidor.use(handlerDetalheDoLivro(detalheDoAmigo()))
    const { unmount } = abrirDetalhe()
    const secao = within(await screen.findByRole('region', { name: 'Quem já leu' }))
    expect(secao.getByText('Aparece quem já devolveu o livro. Devolver não prova que leu.')).toBeInTheDocument()
    expect(secao.getByText('Rafael Costa')).toBeInTheDocument()
    expect(secao.getByText('Lobos · devolveu em 30/09')).toBeInTheDocument()
    unmount()

    servidor.use(handlerDetalheDoLivro(criarDetalheDoLivro([criarExemplarDisponivel(1)])))
    abrirDetalhe()
    expect(await screen.findByText('Ninguém devolveu este livro ainda.')).toBeInTheDocument()
  })

  it('enquanto o livro carrega mostra o estado de carregando', async () => {
    entrarComo('ADM', PERMISSOES_DO_ADM)
    servidor.use(http.get('/api/biblioteca/itens/:id/exemplares', () => delay('infinite')))
    abrirDetalhe()
    expect(await screen.findByRole('status', { name: 'Carregando o livro' })).toBeInTheDocument()
  })

  it('exemplar baixado não aparece na lista', async () => {
    entrarComo('ADM', PERMISSOES_DO_ADM)
    servidor.use(handlerDetalheDoLivro(criarDetalheDoLivro([criarExemplarDisponivel(1), { ...criarExemplarDisponivel(2), situacao: 'BAIXADO' }])))
    abrirDetalhe()
    await screen.findByRole('heading', { level: 1, name: 'Amigo' })
    expect(screen.getByText('Exemplar 1')).toBeInTheDocument()
    expect(screen.queryByText('Exemplar 2')).not.toBeInTheDocument()
  })

  it('o conselheiro com permissão de emprestar vê Emprestar e Devolver, mas não Acrescentar nem Dar baixa', async () => {
    entrarComo('CONSELHEIRO', ['biblioteca.emprestar'])
    servidor.use(handlerDetalheDoLivro(detalheDoAmigo()))
    abrirDetalhe('/biblioteca')
    await screen.findByRole('heading', { level: 1, name: 'Amigo' })
    expect(screen.getByRole('button', { name: 'Emprestar o exemplar 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Devolver o exemplar 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Acrescentar exemplares' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Dar baixa/ })).not.toBeInTheDocument()
  })

  it('sem a permissão de emprestar não pede os exemplares: explica e leva de volta à estante', async () => {
    entrarComo('CONSELHEIRO', [])
    abrirDetalhe('/biblioteca')
    expect(await screen.findByText('Você não pode ver os exemplares')).toBeInTheDocument()
    expect(screen.queryByText('Exemplar 1')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para a estante' })).toHaveAttribute('href', '/biblioteca?aba=fisicos')
  })

  it('a rota recusando com 403 mostra a mesma explicação em vez de quebrar', async () => {
    entrarComo('CONSELHEIRO', ['biblioteca.emprestar'])
    servidor.use(handlerDetalheDoLivro({ status: 403, codigo: 'SEM_PERMISSAO', mensagem: 'Sem permissão' }))
    abrirDetalhe('/biblioteca')
    expect(await screen.findByText('Você não pode ver os exemplares')).toBeInTheDocument()
  })

  it('livro que não existe (404) diz "Livro não encontrado." e leva à estante', async () => {
    entrarComo('ADM', PERMISSOES_DO_ADM)
    servidor.use(handlerDetalheDoLivro({ status: 404, codigo: 'NAO_ENCONTRADO', mensagem: 'Livro não encontrado.' }))
    abrirDetalhe()
    expect(await screen.findByText('Livro não encontrado.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para a estante' })).toHaveAttribute('href', '/adm/biblioteca?aba=fisicos')
  })

  it('falha do servidor mostra o erro com "Tentar de novo"', async () => {
    entrarComo('ADM', PERMISSOES_DO_ADM)
    servidor.use(handlerDetalheDoLivro({ status: 500, codigo: 'ERRO_INTERNO', mensagem: 'Erro interno' }))
    abrirDetalhe()
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('livro sem exemplares ativos mostra o vazio, sem lista', async () => {
    entrarComo('ADM', PERMISSOES_DO_ADM)
    servidor.use(handlerDetalheDoLivro(criarDetalheDoLivro([])))
    abrirDetalhe()
    expect(await screen.findByText('Nenhum exemplar para emprestar')).toBeInTheDocument()
    expect(screen.getByText('Use “Acrescentar exemplares” para voltar a emprestar este livro.')).toBeInTheDocument()
  })

  it('Emprestar no exemplar escolhido abre o diálogo nele e grava o empréstimo desse exemplar', async () => {
    entrarComo('ADM', PERMISSOES_DO_ADM)
    servidor.use(
      handlerDetalheDoLivro(detalheDoAmigo()),
      handlerBuscaDeDesbravadores([criarDesbravadorParaEmprestimo(1, { nome: 'Luísa Martins' })]),
      ...handlersEscritaEmprestimos(chamadas),
    )
    const usuario = userEvent.setup()
    abrirDetalhe()
    await usuario.click(await screen.findByRole('button', { name: 'Emprestar o exemplar 2' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Emprestar “Amigo”' }))
    expect(dialogo.getByText('Exemplar 2 · disponível')).toBeInTheDocument()
    await usuario.type(dialogo.getByLabelText('Desbravador'), 'Lu')
    await usuario.click(await dialogo.findByRole('button', { name: /Luísa Martins/ }))
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar empréstimo' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(chamadas).toEqual([{ metodo: 'POST', caminho: '/api/biblioteca/emprestimos', corpo: { exemplarId: uuid(8002), desbravadorId: uuid(8601) } }])
  })

  it('Devolver abre o diálogo do empréstimo daquele exemplar e grava a devolução dele', async () => {
    entrarComo('ADM', PERMISSOES_DO_ADM)
    const detalhe = detalheDoAmigo()
    servidor.use(handlerDetalheDoLivro(detalhe), ...handlersEscritaEmprestimos(chamadas))
    const usuario = userEvent.setup()
    abrirDetalhe()
    await usuario.click(await screen.findByRole('button', { name: 'Devolver o exemplar 3' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Registrar devolução' }))
    expect(dialogo.getByText('Beatriz Nunes (inativo)')).toBeInTheDocument()
    expect(dialogo.getByText('Devolução prevista para 19/10: 2 dias de atraso.')).toBeInTheDocument()
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar devolução' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0]).toMatchObject({ metodo: 'POST', caminho: `/api/biblioteca/emprestimos/${detalhe.exemplares[2].emprestimo?.id}/devolucao` })
  })

  it('Dar baixa pede confirmação e só então grava', async () => {
    entrarComo('ADM', PERMISSOES_DO_ADM)
    servidor.use(handlerDetalheDoLivro(detalheDoAmigo()), ...handlersEscritaEmprestimos(chamadas))
    const usuario = userEvent.setup()
    abrirDetalhe()
    await usuario.click(await screen.findByRole('button', { name: 'Dar baixa no exemplar 2' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Dar baixa no exemplar 2?' }))
    expect(chamadas).toEqual([])
    await usuario.click(dialogo.getByRole('button', { name: 'Dar baixa' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(chamadas).toEqual([{ metodo: 'POST', caminho: `/api/biblioteca/itens/${LIVRO.id}/exemplares/${uuid(8002)}/baixa`, corpo: {} }])
  })

  it('a recusa da baixa aparece dentro do diálogo, que continua aberto', async () => {
    entrarComo('ADM', PERMISSOES_DO_ADM)
    servidor.use(
      handlerDetalheDoLivro(detalheDoAmigo()),
      ...handlersEscritaEmprestimos(chamadas, { status: 409, codigo: 'CONFLITO', mensagem: 'Esse exemplar está emprestado. Registre a devolução antes.' }),
    )
    const usuario = userEvent.setup()
    abrirDetalhe()
    await usuario.click(await screen.findByRole('button', { name: 'Dar baixa no exemplar 2' }))
    const dialogo = within(await screen.findByRole('dialog'))
    await usuario.click(dialogo.getByRole('button', { name: 'Dar baixa' }))
    expect(await dialogo.findByText('Esse exemplar está emprestado. Registre a devolução antes.')).toBeInTheDocument()
  })

  it('Acrescentar exemplares recusa quantidade fora de 1 a 50 e grava a quantidade escolhida', async () => {
    entrarComo('ADM', PERMISSOES_DO_ADM)
    servidor.use(handlerDetalheDoLivro(detalheDoAmigo()), ...handlersEscritaEmprestimos(chamadas))
    const usuario = userEvent.setup()
    abrirDetalhe()
    await usuario.click(await screen.findByRole('button', { name: 'Acrescentar exemplares' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Acrescentar exemplares' }))
    const campo = dialogo.getByLabelText('Quantidade de exemplares')
    await usuario.clear(campo)
    await usuario.type(campo, '51')
    await usuario.click(dialogo.getByRole('button', { name: 'Acrescentar' }))
    expect(await dialogo.findByText('No máximo 50 exemplares por vez')).toBeInTheDocument()
    expect(chamadas).toEqual([])

    await usuario.clear(campo)
    await usuario.type(campo, '3')
    await usuario.click(dialogo.getByRole('button', { name: 'Acrescentar' }))
    await waitFor(() => expect(chamadas).toEqual([{ metodo: 'POST', caminho: `/api/biblioteca/itens/${LIVRO.id}/exemplares`, corpo: { quantidade: 3 } }]))
  })
})

function EmprestarAberto({ exemplar }: { exemplar?: ExemplarEscolhido }) {
  const [aberto, definirAberto] = useState(true)
  return <DialogoEmprestar aberto={aberto} item={LIVRO} exemplar={exemplar} onFechar={() => definirAberto(false)} />
}

const abrirEmprestar = (exemplar?: ExemplarEscolhido) =>
  renderizarRotas([{ element: <GuardaRota />, children: [{ path: '/', element: <EmprestarAberto exemplar={exemplar} /> }] }], '/')

const DESBRAVADORES = [
  criarDesbravadorParaEmprestimo(1, { nome: 'Lucas Ferreira', unidade: 'Águias', livroEmAberto: { emprestimoId: uuid(9001), titulo: 'Companheiro' } }),
  criarDesbravadorParaEmprestimo(2, { nome: 'Luísa Martins' }),
  criarDesbravadorParaEmprestimo(3, { nome: 'Luan Pereira', unidade: null, entradaEm: '2026-10-10' }),
]

function prepararEmprestar(recusar?: RecusaDaApi) {
  entrarComo('ADM', PERMISSOES_DO_ADM)
  servidor.use(
    handlerDetalheDoLivro(criarDetalheDoLivro([criarExemplarEmprestado(1), criarExemplarDisponivel(2), criarExemplarDisponivel(3)])),
    handlerBuscaDeDesbravadores(DESBRAVADORES),
    ...handlersEscritaEmprestimos(chamadas, recusar),
  )
}

describe('diálogo Emprestar', () => {
  it('abre pelo cartão no menor exemplar livre, com o título do livro', async () => {
    prepararEmprestar()
    abrirEmprestar()
    expect(await screen.findByRole('dialog', { name: 'Emprestar “Amigo”' })).toBeInTheDocument()
    expect(await screen.findByText('Exemplar 2 · disponível')).toBeInTheDocument()
  })

  it('pede ao menos 2 letras, mostra quem já tem livro apagado com o motivo e escolhe quem está livre', async () => {
    prepararEmprestar()
    const usuario = userEvent.setup()
    abrirEmprestar({ id: uuid(8002), numero: 2 })
    const campo = await screen.findByLabelText('Desbravador')
    expect(screen.getByText('Digite ao menos 2 letras')).toBeInTheDocument()
    await usuario.type(campo, 'Lu')
    const ocupado = await screen.findByRole('button', { name: /Lucas Ferreira/ })
    expect(ocupado).toBeDisabled()
    expect(within(ocupado).getByText('Águias · já está com “Companheiro”. Peça a devolução antes.')).toBeInTheDocument()
    expect(screen.queryByText('Digite ao menos 2 letras')).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /Luan Pereira/ }))
    expect(screen.getByText(/Emprestar para/)).toHaveTextContent('Emprestar para Luan Pereira (sem unidade)')
  })

  it('busca sem resultado diz "Nenhum desbravador com esse nome" e "Limpar a busca" volta ao começo', async () => {
    prepararEmprestar()
    const usuario = userEvent.setup()
    abrirEmprestar({ id: uuid(8002), numero: 2 })
    const campo = await screen.findByLabelText('Desbravador')
    await usuario.type(campo, 'Zzz')
    expect(await screen.findByText('Nenhum desbravador com esse nome')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Limpar a busca' }))
    expect(campo).toHaveValue('')
    expect(screen.getByText('Digite ao menos 2 letras')).toBeInTheDocument()
  })

  it('"Devolver até" é só leitura e sempre 14 dias depois: 21/10 → 04/11, e acompanha a data do empréstimo', async () => {
    prepararEmprestar()
    const usuario = userEvent.setup()
    abrirEmprestar({ id: uuid(8002), numero: 2 })
    const dataDoEmprestimo = await screen.findByLabelText('Emprestado em')
    expect(dataDoEmprestimo).toHaveValue('21/10/2026')
    expect(screen.getByText('04/11/2026')).toBeInTheDocument()
    expect(screen.queryByLabelText('Devolver até')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Devolver até/ })).not.toBeInTheDocument()
    expect(screen.getByText('A devolução é sempre 14 dias depois do empréstimo. Esta data não pode ser alterada.')).toBeInTheDocument()

    await usuario.clear(dataDoEmprestimo)
    await usuario.type(dataDoEmprestimo, '14102026')
    expect(screen.getByText('28/10/2026')).toBeInTheDocument()
  })

  it('grava o empréstimo sem campo de devolução e sem data quando é hoje', async () => {
    prepararEmprestar()
    const usuario = userEvent.setup()
    abrirEmprestar({ id: uuid(8002), numero: 2 })
    await usuario.type(await screen.findByLabelText('Desbravador'), 'Lu')
    await usuario.click(await screen.findByRole('button', { name: /Luísa Martins/ }))
    await usuario.click(screen.getByRole('button', { name: 'Registrar empréstimo' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].corpo).toEqual({ exemplarId: uuid(8002), desbravadorId: uuid(8602) })
  })

  it('manda a data escolhida quando não é hoje', async () => {
    prepararEmprestar()
    const usuario = userEvent.setup()
    abrirEmprestar({ id: uuid(8002), numero: 2 })
    const dataDoEmprestimo = await screen.findByLabelText('Emprestado em')
    await usuario.clear(dataDoEmprestimo)
    await usuario.type(dataDoEmprestimo, '14102026')
    await usuario.type(screen.getByLabelText('Desbravador'), 'Lu')
    await usuario.click(await screen.findByRole('button', { name: /Luísa Martins/ }))
    await usuario.click(screen.getByRole('button', { name: 'Registrar empréstimo' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0].corpo).toEqual({ exemplarId: uuid(8002), desbravadorId: uuid(8602), emprestadoEm: '2026-10-14' })
  })

  it('não deixa registrar sem desbravador, com data futura ou com mais de 60 dias', async () => {
    prepararEmprestar()
    const usuario = userEvent.setup()
    abrirEmprestar({ id: uuid(8002), numero: 2 })
    const registrar = await screen.findByRole('button', { name: 'Registrar empréstimo' })
    expect(registrar).toBeDisabled()
    await usuario.type(screen.getByLabelText('Desbravador'), 'Lu')
    await usuario.click(await screen.findByRole('button', { name: /Luísa Martins/ }))
    expect(registrar).toBeEnabled()

    const dataDoEmprestimo = screen.getByLabelText('Emprestado em')
    await usuario.clear(dataDoEmprestimo)
    await usuario.type(dataDoEmprestimo, '22102026')
    expect(registrar).toBeDisabled()
    await usuario.clear(dataDoEmprestimo)
    await usuario.type(dataDoEmprestimo, '21082026')
    expect(registrar).toBeDisabled()
    await usuario.clear(dataDoEmprestimo)
    await usuario.type(dataDoEmprestimo, '22082026')
    expect(registrar).toBeEnabled()
  })

  it('a recusa da API aparece dentro do diálogo, junto do botão', async () => {
    prepararEmprestar({ status: 409, codigo: 'CONFLITO', mensagem: 'Esse exemplar acabou de ser emprestado.' })
    const usuario = userEvent.setup()
    abrirEmprestar({ id: uuid(8002), numero: 2 })
    await usuario.type(await screen.findByLabelText('Desbravador'), 'Lu')
    await usuario.click(await screen.findByRole('button', { name: /Luísa Martins/ }))
    await usuario.click(screen.getByRole('button', { name: 'Registrar empréstimo' }))
    const dialogo = within(screen.getByRole('dialog'))
    expect(await dialogo.findByText('Esse exemplar acabou de ser emprestado.')).toBeInTheDocument()
    expect(dialogo.getByRole('button', { name: 'Registrar empréstimo' })).toBeInTheDocument()
  })

  it('sem internet o botão fica desligado e o motivo está escrito', async () => {
    estado.modo = 'SEM_CONEXAO'
    prepararEmprestar()
    const usuario = userEvent.setup()
    abrirEmprestar({ id: uuid(8002), numero: 2 })
    await usuario.type(await screen.findByLabelText('Desbravador'), 'Lu')
    await usuario.click(await screen.findByRole('button', { name: /Luísa Martins/ }))
    const dialogo = within(screen.getByRole('dialog'))
    expect(dialogo.getByRole('button', { name: 'Registrar empréstimo' })).toBeDisabled()
    expect(dialogo.getByText(SEM_INTERNET)).toBeInTheDocument()
  })

  it('Cancelar fecha sem gravar nada', async () => {
    prepararEmprestar()
    const usuario = userEvent.setup()
    abrirEmprestar({ id: uuid(8002), numero: 2 })
    await usuario.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(chamadas).toEqual([])
  })
})

function DevolverAberto({ emprestimo }: { emprestimo: EmprestimoParaDevolver }) {
  const [aberto, definirAberto] = useState(true)
  return <DialogoDevolver aberto={aberto} emprestimo={emprestimo} onFechar={() => definirAberto(false)} />
}

const BEATRIZ: EmprestimoParaDevolver = {
  emprestimoId: uuid(9100),
  titulo: 'Amigo',
  numeroDoExemplar: 3,
  desbravadorNome: 'Beatriz Nunes',
  desbravadorAtivo: true,
  unidade: 'Leões',
  devolverAte: '2026-10-19',
}

function abrirDevolver(emprestimo: EmprestimoParaDevolver, recusar?: RecusaDaApi) {
  entrarComo('ADM', PERMISSOES_DO_ADM)
  servidor.use(...handlersEscritaEmprestimos(chamadas, recusar))
  return renderizarRotas([{ element: <GuardaRota />, children: [{ path: '/', element: <DevolverAberto emprestimo={emprestimo} /> }] }], '/')
}

describe('diálogo Devolver', () => {
  it('diz quem devolve e o atraso em palavras, com "Devolvido em" só de leitura e igual a hoje', async () => {
    abrirDevolver(BEATRIZ)
    const dialogo = within(await screen.findByRole('dialog', { name: 'Registrar devolução' }))
    expect(dialogo.getByText(/“Amigo”, exemplar 3, volta de/)).toHaveTextContent('“Amigo”, exemplar 3, volta de Beatriz Nunes (Leões).')
    expect(dialogo.getByText('Devolução prevista para 19/10: 2 dias de atraso.')).toBeInTheDocument()
    expect(dialogo.getByText('21/10/2026')).toBeInTheDocument()
    expect(dialogo.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('um dia de atraso fica no singular', async () => {
    abrirDevolver({ ...BEATRIZ, devolverAte: '2026-10-20' })
    expect(await screen.findByText('Devolução prevista para 20/10: 1 dia de atraso.')).toBeInTheDocument()
  })

  it.each(['2026-10-21', '2026-10-28'])('devolver até %s (hoje ou depois) não mostra aviso de atraso', async (devolverAte) => {
    abrirDevolver({ ...BEATRIZ, devolverAte })
    await screen.findByRole('dialog', { name: 'Registrar devolução' })
    expect(screen.queryByText(/de atraso/)).not.toBeInTheDocument()
  })

  it('confirmar grava a devolução daquele empréstimo, sem data no corpo, e fecha', async () => {
    const usuario = userEvent.setup()
    abrirDevolver(BEATRIZ)
    await usuario.click(await screen.findByRole('button', { name: 'Registrar devolução' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(chamadas).toEqual([{ metodo: 'POST', caminho: `/api/biblioteca/emprestimos/${BEATRIZ.emprestimoId}/devolucao`, corpo: {} }])
  })

  it('a recusa aparece dentro do diálogo, junto do botão', async () => {
    const usuario = userEvent.setup()
    abrirDevolver(BEATRIZ, { status: 409, codigo: 'CONFLITO', mensagem: 'Este livro já foi devolvido.' })
    await usuario.click(await screen.findByRole('button', { name: 'Registrar devolução' }))
    const dialogo = within(screen.getByRole('dialog'))
    expect(await dialogo.findByText('Este livro já foi devolvido.')).toBeInTheDocument()
  })

  it('sem internet o botão fica desligado e o motivo está escrito', async () => {
    estado.modo = 'SEM_CONEXAO'
    abrirDevolver(BEATRIZ)
    const dialogo = within(await screen.findByRole('dialog', { name: 'Registrar devolução' }))
    expect(dialogo.getByRole('button', { name: 'Registrar devolução' })).toBeDisabled()
    expect(dialogo.getByText(SEM_INTERNET)).toBeInTheDocument()
  })

  it('desbravador inativo aparece com "(inativo)" no texto', async () => {
    abrirDevolver({ ...BEATRIZ, desbravadorAtivo: false, unidade: null })
    expect(await screen.findByText(/volta de/)).toHaveTextContent('volta de Beatriz Nunes (inativo) (sem unidade).')
  })
})

const LINHAS = [
  criarLinhaDeEmprestimo(1, { titulo: 'Companheiro', desbravadorNome: 'Lucas Ferreira', unidade: 'Águias', emprestadoEm: '2026-10-02', devolverAte: '2026-10-16', situacao: 'ATRASADO', dias: 5 }),
  criarLinhaDeEmprestimo(2, { titulo: 'Pesquisador', desbravadorNome: 'Davi Mendes', emprestadoEm: '2026-10-07', devolverAte: '2026-10-21', situacao: 'VENCE_HOJE' }),
  criarLinhaDeEmprestimo(3, { desbravadorNome: 'Sofia Almeida', desbravadorAtivo: false, unidade: 'Lobos', emprestadoEm: '2026-10-12', devolverAte: '2026-10-26' }),
]

function abrirAba(filtroInicial?: 'atrasados', resposta: () => EmprestimosSaida | RecusaDaApi = () => criarEmprestimos(LINHAS)) {
  entrarComo('ADM', PERMISSOES_DO_ADM)
  const pedidos: URLSearchParams[] = []
  servidor.use(handlerEmprestimos(resposta, pedidos), ...handlersEscritaEmprestimos(chamadas))
  renderizarRotas([{ element: <GuardaRota />, children: [{ path: '/', element: <AbaEmprestimos filtroInicial={filtroInicial} /> }] }], '/')
  return pedidos
}

describe('aba Empréstimos', () => {
  it('lista os empréstimos na ordem da API, com situação em texto e "(inativo)"', async () => {
    abrirAba()
    const tabela = within(await screen.findByRole('table'))
    const linhas = tabela.getAllByRole('row').slice(1)
    expect(linhas).toHaveLength(3)
    expect(within(linhas[0]).getByText('Companheiro · ex. 1')).toBeInTheDocument()
    expect(within(linhas[0]).getByText('Atrasado há 5 dias')).toBeInTheDocument()
    expect(within(linhas[0]).getByText('Águias')).toBeInTheDocument()
    expect(within(linhas[0]).getByText('02/10')).toBeInTheDocument()
    expect(within(linhas[0]).getByText('16/10')).toBeInTheDocument()
    expect(within(linhas[1]).getByText('Vence hoje')).toBeInTheDocument()
    expect(within(linhas[2]).getByText('No prazo')).toBeInTheDocument()
    expect(within(linhas[2]).getByText('Sofia Almeida (inativo)')).toBeInTheDocument()
    expect(tabela.getAllByRole('button', { name: /^Devolver/ })).toHaveLength(3)
  })

  it('os três totais aparecem e tocar em um filtra a lista', async () => {
    const pedidos = abrirAba()
    const usuario = userEvent.setup()
    const atrasados = await screen.findByRole('button', { name: /Atrasados/ })
    expect(atrasados).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /Emprestados agora/ })).toHaveTextContent('3')
    expect(screen.getByRole('button', { name: /Vencem hoje/ })).toHaveTextContent('1')
    await usuario.click(atrasados)
    await waitFor(() => expect(pedidos.some((pedido) => pedido.get('situacao') === 'atrasados')).toBe(true))
    expect(atrasados).toHaveAttribute('aria-pressed', 'true')
  })

  it('filtroInicial já abre a aba filtrada', async () => {
    const pedidos = abrirAba('atrasados')
    await screen.findByRole('table')
    expect(pedidos.some((pedido) => pedido.get('situacao') === 'atrasados')).toBe(true)
    expect(screen.getByRole('button', { name: /Atrasados/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a busca por título ou desbravador vai para a API', async () => {
    const pedidos = abrirAba()
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText('Buscar livro ou desbravador'), 'Davi')
    await waitFor(() => expect(pedidos.some((pedido) => pedido.get('busca') === 'Davi')).toBe(true))
  })

  it('busca sem resultado diz que nada bate e "Limpar a busca" volta à lista inteira', async () => {
    let vazia = false
    abrirAba(undefined, () => criarEmprestimos(vazia ? [] : LINHAS))
    const usuario = userEvent.setup()
    await screen.findByRole('table')
    vazia = true
    await usuario.type(screen.getByLabelText('Buscar livro ou desbravador'), 'Zzz')
    expect(await screen.findByText('Nenhum empréstimo com esses filtros')).toBeInTheDocument()
    vazia = false
    await usuario.click(screen.getByRole('button', { name: 'Limpar a busca' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('sem nenhum empréstimo diz "Nenhum livro emprestado agora"', async () => {
    abrirAba(undefined, () => criarEmprestimos([]))
    expect(await screen.findByText('Nenhum livro emprestado agora')).toBeInTheDocument()
  })

  it('falha da API mostra o erro com "Tentar de novo"', async () => {
    abrirAba(undefined, () => ({ status: 500, codigo: 'ERRO_INTERNO', mensagem: 'Erro interno' }))
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('Devolver na linha abre o diálogo daquele empréstimo e grava a devolução', async () => {
    abrirAba()
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Devolver Companheiro, exemplar 1' }))
    const dialogo = within(await screen.findByRole('dialog', { name: 'Registrar devolução' }))
    expect(dialogo.getByText('Devolução prevista para 16/10: 5 dias de atraso.')).toBeInTheDocument()
    await usuario.click(dialogo.getByRole('button', { name: 'Registrar devolução' }))
    await waitFor(() => expect(chamadas).toHaveLength(1))
    expect(chamadas[0].caminho).toBe(`/api/biblioteca/emprestimos/${LINHAS[0].emprestimoId}/devolucao`)
  })
})

describe('selo da aba Empréstimos', () => {
  const estante = [criarCategoriaBiblioteca(1, [LIVRO], { nome: 'Livros' })]

  function abrirTela(papel: Papel, permissoes: string[], atrasados: number) {
    entrarComo(papel, permissoes)
    const linhas = Array.from({ length: atrasados }, (_, indice) => criarLinhaDeEmprestimo(indice + 1, { situacao: 'ATRASADO', dias: 3, devolverAte: '2026-10-18' }))
    servidor.use(handlerBiblioteca(estante), handlerEmprestimos(() => criarEmprestimos(linhas)))
    renderizarRotas([{ element: <GuardaRota />, children: [{ path: '/adm/biblioteca', element: <TelaBiblioteca /> }] }], '/adm/biblioteca')
  }

  it('mostra "Empréstimos · N atrasados" com a aba fechada', async () => {
    abrirTela('ADM', PERMISSOES_DO_ADM, 2)
    expect(await screen.findByRole('tab', { name: 'Empréstimos · 2 atrasados' })).toBeInTheDocument()
  })

  it('no singular com 1 atrasado', async () => {
    abrirTela('ADM', PERMISSOES_DO_ADM, 1)
    expect(await screen.findByRole('tab', { name: 'Empréstimos · 1 atrasado' })).toBeInTheDocument()
  })

  it('some quando não há atrasado', async () => {
    abrirTela('ADM', PERMISSOES_DO_ADM, 0)
    expect(await screen.findByRole('tab', { name: 'Empréstimos' })).toBeInTheDocument()
  })
})
