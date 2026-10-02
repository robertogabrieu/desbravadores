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
  handlerEditarUsuario,
  handlerEditarVinculo,
  handlerListaUsuarios,
  handlerNovoVinculo,
  handlerRegra422,
  handlerUsuario,
} from '../../../testes/handlers/usuarios'
import { renderizarRotas } from '../../../testes/renderizar'
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

describe('novo usuário', () => {
  it('salva usuário e vínculos de uma vez, mandando só as permissões que diferem do padrão', async () => {
    const corpos: unknown[] = []
    abrir(TRES, [], '/adm/usuarios/novo')
    const novo = criarUsuario({ id: uuid(730), nome: 'Novo' })
    servidor.use(handlerCriarUsuario(novo, corpos), handlerUsuario(caixa(novo)))
    await screen.findByLabelText('Nome')
    await userEvent.type(screen.getByLabelText('Nome'), 'Novo Líder')
    await userEvent.type(screen.getByLabelText('E-mail'), 'novo@clube.test')
    await userEvent.selectOptions(screen.getByLabelText('Gênero'), 'F')

    const primeiro = screen.getByRole('group', { name: 'Vínculo 1' })
    await userEvent.selectOptions(within(primeiro).getByLabelText('Papel'), 'CONSELHEIRO')
    await userEvent.click(await within(primeiro).findByRole('checkbox', { name: 'Águias' }))
    await userEvent.click(within(primeiro).getByRole('checkbox', { name: 'Editar dados dos desbravadores' }))

    await userEvent.click(screen.getByRole('button', { name: '+ Acrescentar papel' }))
    const segundo = screen.getByRole('group', { name: 'Vínculo 2' })
    await userEvent.selectOptions(within(segundo).getByLabelText('Papel'), 'INSTRUTOR')
    await userEvent.click(await within(segundo).findByRole('checkbox', { name: 'Amigo' }))

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(corpos).toHaveLength(1))
    expect(corpos[0]).toEqual({
      nome: 'Novo Líder',
      email: 'novo@clube.test',
      genero: 'F',
      vinculos: [
        { papel: 'CONSELHEIRO', unidadeIds: [AGUIAS.id], classeIds: [], ajustes: [{ permissao: 'dbv.editar', concedida: true }] },
        { papel: 'INSTRUTOR', unidadeIds: [], classeIds: [AMIGO.id], ajustes: [] },
      ],
    })
    await screen.findByRole('heading', { level: 1, name: 'Novo' })
  })

  it('cada papel mostra só as permissões que se aplicam a ele, e Adm nenhuma', async () => {
    abrir(TRES, [], '/adm/usuarios/novo')
    const bloco = within(await screen.findByRole('group', { name: 'Vínculo 1' }))
    const papel = bloco.getByLabelText('Papel')

    await userEvent.selectOptions(papel, 'CONSELHEIRO')
    expect(await bloco.findByRole('checkbox', { name: 'Editar dados dos desbravadores' })).toBeInTheDocument()
    expect(bloco.getByRole('checkbox', { name: 'Ver desbravadores' })).toBeChecked()
    expect(bloco.getByRole('checkbox', { name: 'Editar dados dos desbravadores' })).not.toBeChecked()
    expect(bloco.queryByRole('checkbox', { name: 'Montar cronograma da classe' })).not.toBeInTheDocument()

    await userEvent.selectOptions(papel, 'INSTRUTOR')
    expect(await bloco.findByRole('checkbox', { name: 'Montar cronograma da classe' })).toBeInTheDocument()
    expect(bloco.queryByRole('checkbox', { name: 'Editar dados dos desbravadores' })).not.toBeInTheDocument()

    await userEvent.selectOptions(papel, 'ADM')
    expect(bloco.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})

describe('lista → telas dedicadas', () => {
  it('"Convidar usuário" leva ao formulário de novo usuário', async () => {
    const { roteador } = abrir()
    await userEvent.click(await screen.findByRole('link', { name: 'Convidar usuário' }))
    expect(roteador.state.location.pathname).toBe('/adm/usuarios/novo')
  })
})

describe('edição de usuário existente', () => {
  it('trava e-mail, e nome e gênero quando não está convidado; sem botões de salvar parcial', async () => {
    abrir(TRES, [], `/adm/usuarios/${thiago.id}/editar`)
    expect(await screen.findByLabelText('E-mail')).toBeDisabled()
    expect(screen.getByLabelText('Nome')).toBeDisabled()
    expect(screen.getByLabelText('Gênero')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Salvar dados' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar vínculo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument()
  })

  it('convidado edita nome e gênero com o Salvar único', async () => {
    const corposEdicao: unknown[] = []
    abrir(TRES, [], `/adm/usuarios/${priscila.id}/editar`)
    servidor.use(handlerEditarUsuario(priscila, corposEdicao))
    expect(await screen.findByLabelText('E-mail')).toBeDisabled()
    const nome = screen.getByLabelText('Nome')
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Priscila A. Lima')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(corposEdicao).toEqual([{ nome: 'Priscila A. Lima', genero: 'F' }]))
  })

  it('o Salvar único grava o vínculo alterado pelo PUT, com as permissões marcadas', async () => {
    const corpos: unknown[] = []
    abrir(TRES, [], `/adm/usuarios/${thiago.id}/editar`)
    servidor.use(handlerEditarVinculo(thiago, corpos))
    const bloco = within(await screen.findByRole('group', { name: 'Vínculo 1' }))
    expect(await bloco.findByRole('checkbox', { name: 'Águias' })).toBeChecked()
    expect(bloco.getByRole('checkbox', { name: 'Leões' })).not.toBeChecked()
    expect(bloco.getByRole('checkbox', { name: 'Editar dados dos desbravadores' })).toBeChecked()
    expect(bloco.getByLabelText('Papel')).toBeDisabled()
    await userEvent.click(bloco.getByRole('checkbox', { name: 'Leões' }))
    await userEvent.click(bloco.getByRole('checkbox', { name: 'Editar dados dos desbravadores' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(corpos).toHaveLength(1))
    expect(corpos[0]).toEqual({ unidadeIds: [AGUIAS.id, LEOES.id], ajustes: [] })
  })

  it('acrescenta um papel com POST do vínculo novo', async () => {
    const corpos: unknown[] = []
    abrir(TRES, [], `/adm/usuarios/${thiago.id}/editar`)
    servidor.use(handlerNovoVinculo(thiago, corpos))
    await userEvent.click(await screen.findByRole('button', { name: '+ Acrescentar papel' }))
    const bloco = within(screen.getByRole('group', { name: 'Vínculo 2' }))
    await userEvent.selectOptions(bloco.getByLabelText('Papel'), 'INSTRUTOR')
    await userEvent.click(await bloco.findByRole('checkbox', { name: 'Companheiro' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(corpos).toEqual([{ papel: 'INSTRUTOR', unidadeIds: [], classeIds: [COMPANHEIRO.id], ajustes: [] }]))
  })

  it('mostra no bloco o erro de permissão inválida', async () => {
    abrir(TRES, [], `/adm/usuarios/${thiago.id}/editar`)
    servidor.use(handlerRegra422('put', '/api/vinculos/:id', 'AJUSTE_INVALIDO'))
    const bloco = within(await screen.findByRole('group', { name: 'Vínculo 1' }))
    await userEvent.click(await bloco.findByRole('checkbox', { name: 'Editar dados dos desbravadores' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await bloco.findByRole('alert')).toHaveTextContent('Alguma permissão não vale para este papel.')
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
