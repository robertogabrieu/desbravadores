import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Usuario } from '../../../api/usuarios'
import { caixa } from '../../../testes/handlers/caixa'
import { criarClasse, criarUnidade, handlerClasses, handlerUnidades } from '../../../testes/handlers/leitura'
import { handlersSessao, uuid } from '../../../testes/handlers/sessao'
import {
  criarUsuario,
  criarVinculoUsuario,
  handlerCatalogoUsuarios,
  handlerCriarUsuario,
  handlerDesativarUsuario,
  handlerListaUsuarios,
  handlerRegra422,
  handlerUsuario,
} from '../../../testes/handlers/usuarios'
import { renderizarRotas } from '../../../testes/renderizar'
import { simularLargura } from '../../../testes/midia'
import { servidor } from '../../../testes/servidor'
import { rotasAdmUsuarios } from './rotas'

const AGUIAS = criarUnidade({ id: uuid(201), nome: 'Águias' })
const LEOES = criarUnidade({ id: uuid(202), nome: 'Leões' })
const AMIGO = criarClasse({ id: uuid(101), nome: 'Amigo' })
const COMPANHEIRO = criarClasse({ id: uuid(102), nome: 'Companheiro' })

const diretoria = criarUsuario({ id: uuid(701), nome: 'Diretoria', email: 'diretoria@clube.test', vinculos: [criarVinculoUsuario('ADM', 1)] })
const thiago = criarUsuario({
  id: uuid(702),
  nome: 'Thiago Mendes',
  vinculos: [criarVinculoUsuario('CONSELHEIRO', 2, { unidades: [{ id: AGUIAS.id, nome: 'Águias' }], ajustes: [{ permissao: 'dbv.editar', concedida: true }] })],
})
const priscila = criarUsuario({
  id: uuid(703),
  nome: 'Priscila Andrade',
  email: 'priscila@clube.test',
  genero: 'F',
  situacao: 'CONVIDADO',
  vinculos: [criarVinculoUsuario('INSTRUTOR', 3)],
})
const TRES = [diretoria, thiago, priscila]

function abrir(usuarios: Usuario[] = TRES, consultas: URLSearchParams[] = [], rota = '/adm/usuarios') {
  servidor.use(
    ...handlersSessao(),
    handlerListaUsuarios(usuarios, consultas),
    handlerUsuario(...usuarios.map((u) => caixa(u))),
    handlerCatalogoUsuarios(),
    handlerUnidades([AGUIAS, LEOES]),
    handlerClasses([AMIGO, COMPANHEIRO]),
  )
  return renderizarRotas(rotasAdmUsuarios, rota)
}

describe('lista de usuários', () => {
  it('mostra abas com contagens e a tabela com nome, e-mail, papéis e situação', async () => {
    abrir()
    expect(await screen.findByRole('tab', { name: 'Todos · 3' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Adm · 1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Conselheiros · 1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Instrutores · 1' })).toBeInTheDocument()
    const linha = screen.getByRole('row', { name: /Priscila Andrade/ })
    expect(within(linha).getByText('priscila@clube.test')).toBeInTheDocument()
    expect(within(linha).getByText('Instrutor')).toBeInTheDocument()
    expect(within(linha).getByText('Convite enviado')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /Thiago Mendes/ })).getByText('Ativo')).toBeInTheDocument()
  })

  it('a tela não abre outro conteúdo principal: ela já mora no do layout do Adm', async () => {
    abrir()
    await screen.findByRole('tab', { name: 'Todos · 3' })
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
  })

  it('no celular cada usuário vira um cartão que leva à ficha, com e-mail, papéis e situação', async () => {
    simularLargura(390)
    const { roteador } = abrir()
    const cartao = await screen.findByRole('link', { name: /Priscila Andrade/ })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(within(cartao).getByText('priscila@clube.test')).toHaveClass('break-all')
    expect(within(cartao).getByText('Instrutor')).toHaveClass('text-sm')
    expect(within(cartao).getByText('Convite enviado')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: /Thiago Mendes/ })).getByText('Ativo')).toBeInTheDocument()
    expect(within(screen.getByRole('link', { name: /Diretoria/ })).getByText('Adm')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Convidar usuário' })).toHaveClass('w-full', 'whitespace-nowrap')
    await userEvent.click(cartao)
    expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${priscila.id}`)
  })

  it('a situação vem com ícone além do texto e os selos de papel têm 14px na tabela', async () => {
    abrir()
    const linha = await screen.findByRole('row', { name: /Priscila Andrade/ })
    expect(within(linha).getByText('Instrutor')).toHaveClass('text-sm')
    expect(within(linha).getByText('Convite enviado').querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Convidar usuário' })).not.toHaveClass('w-full')
  })

  it('a aba filtra por papel', async () => {
    const consultas: URLSearchParams[] = []
    abrir(TRES, consultas)
    await userEvent.click(await screen.findByRole('tab', { name: 'Conselheiros · 1' }))
    await waitFor(() => expect(screen.queryByText('Diretoria')).not.toBeInTheDocument())
    expect(screen.getByText('Thiago Mendes')).toBeInTheDocument()
    expect(consultas.at(-1)?.get('papel')).toBe('CONSELHEIRO')
    expect(screen.getByRole('tab', { name: 'Conselheiros · 1' })).toHaveAttribute('aria-selected', 'true')
  })

  it('abrir com papel e página no endereço pede os dois à API', async () => {
    const consultas: URLSearchParams[] = []
    abrir(TRES, consultas, '/adm/usuarios?papel=INSTRUTOR&pagina=2')
    await waitFor(() => expect(consultas.length).toBeGreaterThan(0))
    expect(consultas[0]?.get('papel')).toBe('INSTRUTOR')
    expect(consultas[0]?.get('pagina')).toBe('2')
  })

  it('a busca vai para a API', async () => {
    const consultas: URLSearchParams[] = []
    abrir(TRES, consultas)
    await screen.findByText('Diretoria')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar usuário' }), 'priscila')
    await waitFor(() => expect(screen.queryByText('Diretoria')).not.toBeInTheDocument())
    expect(screen.getByText('Priscila Andrade')).toBeInTheDocument()
    expect(consultas.at(-1)?.get('busca')).toBe('priscila')
  })

  it('limpar a busca pelo endereço limpa o campo e a busca antiga não volta', async () => {
    const { roteador } = abrir(TRES, [], '/adm/usuarios?busca=priscila')
    const campo = await screen.findByRole('searchbox', { name: 'Buscar usuário' })
    expect(campo).toHaveValue('priscila')
    await act(() => roteador.navigate('/adm/usuarios'))
    expect(campo).toHaveValue('')
    await new Promise((resolver) => setTimeout(resolver, 450))
    expect(roteador.state.location.search).toBe('')
    expect(campo).toHaveValue('')
  })

  it('pagina de 25 em 25', async () => {
    const muitos = Array.from({ length: 30 }, (_, i) => criarUsuario({ id: uuid(800 + i), nome: `Pessoa ${String(i + 1).padStart(2, '0')}`, email: `p${i}@clube.test` }))
    const consultas: URLSearchParams[] = []
    abrir(muitos, consultas)
    expect(await screen.findByText('1–25 de 30')).toBeInTheDocument()
    expect(consultas[0]?.get('porPagina')).toBe('25')
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(await screen.findByText('26–30 de 30')).toBeInTheDocument()
    expect(screen.getByText('Pessoa 30')).toBeInTheDocument()
    expect(consultas.at(-1)?.get('pagina')).toBe('2')
  })
})

describe('novo usuário: convidar numa tela só', () => {
  const abrirNovo = () => abrir(TRES, [], '/adm/usuarios/novo')

  it('dados em cima; a pergunta do papel passa de "a pessoa" para o primeiro nome; três cartões, nenhum marcado nem "já tem"', async () => {
    abrirNovo()
    expect(await screen.findByLabelText('Nome')).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
    expect(screen.getByLabelText('Gênero')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Que papel a pessoa vai ter?' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nome'), 'Rui Novo')
    expect(screen.getByRole('heading', { level: 2, name: 'Que papel Rui vai ter?' })).toBeInTheDocument()
    const cartoes = screen.getAllByRole('radio')
    expect(cartoes).toHaveLength(3)
    cartoes.forEach((cartao) => {
      expect(cartao).not.toBeChecked()
      expect(cartao).toBeEnabled()
    })
    expect(screen.queryByText('já tem')).not.toBeInTheDocument()
    expect(screen.getByText('Começa com as permissões do papel. Outros papéis e ajustes, depois, na ficha.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Escolha das unidades' })).not.toBeInTheDocument()
  })

  it('Conselheiro mostra as unidades; Instrutor limpa o escopo e mostra as classes; Adm esconde o bloco', async () => {
    abrirNovo()
    await userEvent.click(await screen.findByRole('radio', { name: /Conselheiro/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Águias' }))
    expect(screen.getByRole('button', { name: 'Águias' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('radio', { name: /Instrutor/ }))
    expect(await screen.findByRole('group', { name: 'Escolha das classes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Águias' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Amigo' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('radio', { name: /Conselheiro/ }))
    expect(await screen.findByRole('button', { name: 'Águias' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('radio', { name: /Adm/ }))
    expect(screen.queryByRole('group', { name: /Escolha das/ })).not.toBeInTheDocument()
  })

  it('trocar o papel limpa a busca e o escopo do outro', async () => {
    abrirNovo()
    await userEvent.click(await screen.findByRole('radio', { name: /Conselheiro/ }))
    await userEvent.type(await screen.findByLabelText('Buscar unidade'), 'zzz')
    expect(screen.getByText('Nenhuma unidade com esse nome')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Instrutor/ }))
    expect(await screen.findByLabelText('Buscar classe')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Amigo' })).toBeInTheDocument()
  })

  it('recusas: sem nome ou e-mail, sem papel e sem escopo não gravam', async () => {
    const corpos: unknown[] = []
    abrirNovo()
    servidor.use(handlerCriarUsuario(criarUsuario({ id: uuid(730) }), corpos))
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Preencha o nome e o e-mail.')
    await userEvent.type(screen.getByLabelText('Nome'), 'Rui Novo')
    await userEvent.type(screen.getByLabelText('E-mail'), 'rui@clube.test')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha um papel.')
    await userEvent.click(screen.getByRole('radio', { name: /Conselheiro/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    const mensagem = await screen.findByRole('alert')
    expect(mensagem).toHaveTextContent('Escolha pelo menos uma unidade.')
    const grupo = screen.getByRole('group', { name: 'Escolha das unidades' })
    expect(grupo).toHaveFocus()
    expect(grupo).toHaveAttribute('aria-describedby', mensagem.id)
    expect(corpos).toEqual([])
  })

  it('Salvar manda um vínculo só, sem ajustes, e vai à ficha do criado com replace', async () => {
    const corpos: unknown[] = []
    const { roteador } = abrirNovo()
    const novo = criarUsuario({ id: uuid(730), nome: 'Rui Novo' })
    servidor.use(handlerCriarUsuario(novo, corpos), handlerUsuario(caixa(novo)))
    await userEvent.type(await screen.findByLabelText('Nome'), 'Rui Novo')
    await userEvent.type(screen.getByLabelText('E-mail'), 'rui@clube.test')
    await userEvent.selectOptions(screen.getByLabelText('Gênero'), 'M')
    await userEvent.click(screen.getByRole('radio', { name: /Instrutor/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Amigo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpos).toHaveLength(1))
    expect(corpos[0]).toEqual({
      nome: 'Rui Novo',
      email: 'rui@clube.test',
      genero: 'M',
      vinculos: [{ papel: 'INSTRUTOR', unidadeIds: [], classeIds: [AMIGO.id], ajustes: [] }],
    })
    await screen.findByRole('heading', { level: 1, name: 'Rui Novo' })
    expect(roteador.state.historyAction).toBe('REPLACE')
    expect(roteador.state.location.pathname).toBe(`/adm/usuarios/${uuid(730)}`)
  })

  it('Adm grava sem escopo', async () => {
    const corpos: unknown[] = []
    abrirNovo()
    const novo = criarUsuario({ id: uuid(730), nome: 'Rui Novo' })
    servidor.use(handlerCriarUsuario(novo, corpos), handlerUsuario(caixa(novo)))
    await userEvent.type(await screen.findByLabelText('Nome'), 'Rui Novo')
    await userEvent.type(screen.getByLabelText('E-mail'), 'rui@clube.test')
    await userEvent.click(screen.getByRole('radio', { name: /Adm/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpos).toHaveLength(1))
    expect(corpos[0]).toMatchObject({ vinculos: [{ papel: 'ADM', unidadeIds: [], classeIds: [], ajustes: [] }] })
  })

  it('409 da API: a mensagem aparece na tela, sem sair', async () => {
    const { roteador } = abrirNovo()
    servidor.use(http.post('/api/usuarios', () => HttpResponse.json({ codigo: 'CONFLITO', mensagem: 'Esta pessoa já tem este papel no clube.' }, { status: 409 })))
    await userEvent.type(await screen.findByLabelText('Nome'), 'Rui Novo')
    await userEvent.type(screen.getByLabelText('E-mail'), 'rui@clube.test')
    await userEvent.click(screen.getByRole('radio', { name: /Adm/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta pessoa já tem este papel no clube.')
    expect(roteador.state.location.pathname).toBe('/adm/usuarios/novo')
  })
})

describe('lista → telas dedicadas', () => {
  it('"Convidar usuário" leva ao formulário de novo usuário', async () => {
    const { roteador } = abrir()
    await userEvent.click(await screen.findByRole('link', { name: 'Convidar usuário' }))
    expect(roteador.state.location.pathname).toBe('/adm/usuarios/novo')
  })
})

describe('desativar na ficha', () => {
  it('desativar pede confirmação: um toque não chama a API, cancelar fecha a janela', async () => {
    const chamadas: string[] = []
    abrir(TRES, [], `/adm/usuarios/${thiago.id}`)
    servidor.use(handlerDesativarUsuario({ ...thiago, situacao: 'INATIVO' }, chamadas))
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar neste clube' }))
    const janela = within(screen.getByRole('dialog'))
    expect(janela.getByText('A pessoa perde o acesso a este clube na hora.')).toBeInTheDocument()
    expect(chamadas).toEqual([])
    await userEvent.click(janela.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(chamadas).toEqual([])
  })

  it('desativa neste clube depois de confirmar', async () => {
    const chamadas: string[] = []
    abrir(TRES, [], `/adm/usuarios/${thiago.id}`)
    servidor.use(handlerDesativarUsuario({ ...thiago, situacao: 'INATIVO' }, chamadas))
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar neste clube' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desativar' }))
    await waitFor(() => expect(chamadas).toEqual([thiago.id]))
  })

  it('mostra o erro de último Adm ao desativar', async () => {
    abrir(TRES, [], `/adm/usuarios/${diretoria.id}`)
    servidor.use(handlerRegra422('post', '/api/usuarios/:id/desativar', 'ULTIMO_ADM'))
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar neste clube' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desativar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('O clube precisa de pelo menos um Adm ativo.')
  })
})

describe('lista de usuários: filtro, ficha e erro', () => {
  it('o filtro de papéis são abas de verdade: as setas do teclado trocam o papel', async () => {
    const consultas: URLSearchParams[] = []
    abrir(TRES, consultas)
    const todos = await screen.findByRole('tab', { name: 'Todos · 3' })
    act(() => todos.focus())
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() => expect(screen.getByRole('tab', { name: /^Adm/ })).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByRole('tab', { name: /^Adm/ })).toHaveFocus()
    await waitFor(() => expect(consultas.at(-1)?.get('papel')).toBe('ADM'))
    await userEvent.keyboard('{ArrowLeft}')
    await waitFor(() => expect(screen.getByRole('tab', { name: /^Todos/ })).toHaveAttribute('aria-selected', 'true'))
  })

  it('o nome do usuário traz o ícone de abrir a ficha, e o nome acessível continua sendo o nome', async () => {
    abrir()
    const link = await screen.findByRole('link', { name: 'Priscila Andrade' })
    expect(link).toHaveAttribute('href', `/adm/usuarios/${uuid(703)}`)
    expect(link.querySelector('[data-sinal="abre-ficha"]')).not.toBeNull()
  })

  it('erro ao carregar mostra a mensagem da API e repete a busca pelo "Tentar de novo"', async () => {
    servidor.use(
      ...handlersSessao(),
      http.get('/api/usuarios', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falha ao listar usuários.' }, { status: 500 })),
      handlerCatalogoUsuarios(),
      handlerUnidades([AGUIAS, LEOES]),
      handlerClasses([AMIGO, COMPANHEIRO]),
    )
    renderizarRotas(rotasAdmUsuarios, '/adm/usuarios')
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao listar usuários.')
    servidor.use(handlerListaUsuarios(TRES))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('link', { name: 'Priscila Andrade' })).toBeInTheDocument()
  })
})
