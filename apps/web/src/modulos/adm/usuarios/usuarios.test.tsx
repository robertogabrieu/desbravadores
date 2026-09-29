import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Usuario } from '../../../api/usuarios'
import { criarClasse, criarUnidade, handlerClasses, handlerUnidades } from '../../../testes/handlers/leitura'
import { handlersSessao, uuid } from '../../../testes/handlers/sessao'
import {
  criarUsuario,
  criarVinculoUsuario,
  handlerCatalogoUsuarios,
  handlerConvite,
  handlerCriarUsuario,
  handlerDesativarUsuario,
  handlerEditarUsuario,
  handlerEditarVinculo,
  handlerListaUsuarios,
  handlerNovoVinculo,
  handlerRegra422,
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

function abrir(usuarios: Usuario[] = TRES, consultas: URLSearchParams[] = []) {
  servidor.use(
    ...handlersSessao(),
    handlerListaUsuarios(usuarios, consultas),
    handlerCatalogoUsuarios(),
    handlerUnidades([AGUIAS, LEOES]),
    handlerClasses([AMIGO, COMPANHEIRO]),
  )
  return renderizarRotas(rotasAdmUsuarios, '/adm/usuarios')
}

async function abrirPainel(nome: string) {
  await userEvent.click(await screen.findByRole('button', { name: nome }))
  return screen.findByRole('dialog')
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

  it('a busca vai para a API', async () => {
    const consultas: URLSearchParams[] = []
    abrir(TRES, consultas)
    await screen.findByText('Diretoria')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar usuário' }), 'priscila')
    await waitFor(() => expect(screen.queryByText('Diretoria')).not.toBeInTheDocument())
    expect(screen.getByText('Priscila Andrade')).toBeInTheDocument()
    expect(consultas.at(-1)?.get('busca')).toBe('priscila')
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
    abrir()
    servidor.use(handlerCriarUsuario(criarUsuario({ nome: 'Novo' }), corpos))
    await userEvent.click(await screen.findByRole('button', { name: 'Convidar usuário' }))
    const painel = await screen.findByRole('dialog', { name: 'Novo usuário' })
    await userEvent.type(within(painel).getByLabelText('Nome'), 'Novo Líder')
    await userEvent.type(within(painel).getByLabelText('E-mail'), 'novo@clube.test')
    await userEvent.selectOptions(within(painel).getByLabelText('Gênero'), 'F')

    const primeiro = within(painel).getByRole('group', { name: 'Vínculo 1' })
    await userEvent.selectOptions(within(primeiro).getByLabelText('Papel'), 'CONSELHEIRO')
    await userEvent.click(await within(primeiro).findByRole('checkbox', { name: 'Águias' }))
    await userEvent.click(within(primeiro).getByRole('checkbox', { name: 'Editar dados dos desbravadores' }))

    await userEvent.click(within(painel).getByRole('button', { name: '+ Acrescentar papel' }))
    const segundo = within(painel).getByRole('group', { name: 'Vínculo 2' })
    await userEvent.selectOptions(within(segundo).getByLabelText('Papel'), 'INSTRUTOR')
    await userEvent.click(await within(segundo).findByRole('checkbox', { name: 'Amigo' }))

    await userEvent.click(within(painel).getByRole('button', { name: 'Salvar' }))
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
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('cada papel mostra só as permissões que se aplicam a ele, e Adm nenhuma', async () => {
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Convidar usuário' }))
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

describe('usuário existente', () => {
  it('trava e-mail, e nome e gênero quando não está convidado', async () => {
    abrir()
    const painel = within(await abrirPainel('Thiago Mendes'))
    expect(painel.getByLabelText('E-mail')).toBeDisabled()
    expect(painel.getByLabelText('Nome')).toBeDisabled()
    expect(painel.getByLabelText('Gênero')).toBeDisabled()
    expect(painel.queryByRole('button', { name: 'Salvar dados' })).not.toBeInTheDocument()
  })

  it('convidado edita nome e gênero e pode reenviar o convite', async () => {
    const corposEdicao: unknown[] = []
    const convites: string[] = []
    abrir()
    servidor.use(handlerEditarUsuario(priscila, corposEdicao), handlerConvite(convites))
    const painel = within(await abrirPainel('Priscila Andrade'))
    expect(painel.getByLabelText('E-mail')).toBeDisabled()
    const nome = painel.getByLabelText('Nome')
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Priscila A. Lima')
    await userEvent.click(painel.getByRole('button', { name: 'Salvar dados' }))
    await waitFor(() => expect(corposEdicao).toEqual([{ nome: 'Priscila A. Lima', genero: 'F' }]))
    await userEvent.click(painel.getByRole('button', { name: 'Reenviar convite' }))
    await waitFor(() => expect(convites).toEqual([priscila.id]))
  })

  it('reenviar convite só existe para convidado', async () => {
    abrir()
    const painel = within(await abrirPainel('Thiago Mendes'))
    expect(painel.queryByRole('button', { name: 'Reenviar convite' })).not.toBeInTheDocument()
  })

  it('cada bloco salva sozinho pelo PUT do vínculo, com as permissões marcadas', async () => {
    const corpos: unknown[] = []
    abrir()
    servidor.use(handlerEditarVinculo(thiago, corpos))
    const painel = within(await abrirPainel('Thiago Mendes'))
    const bloco = within(painel.getByRole('group', { name: 'Vínculo 1' }))
    expect(await bloco.findByRole('checkbox', { name: 'Águias' })).toBeChecked()
    expect(bloco.getByRole('checkbox', { name: 'Leões' })).not.toBeChecked()
    expect(bloco.getByRole('checkbox', { name: 'Editar dados dos desbravadores' })).toBeChecked()
    expect(bloco.queryByLabelText('Papel')).toBeDisabled()
    await userEvent.click(bloco.getByRole('checkbox', { name: 'Leões' }))
    await userEvent.click(bloco.getByRole('checkbox', { name: 'Editar dados dos desbravadores' }))
    await userEvent.click(bloco.getByRole('button', { name: 'Salvar vínculo' }))
    await waitFor(() => expect(corpos).toHaveLength(1))
    expect(corpos[0]).toEqual({ unidadeIds: [AGUIAS.id, LEOES.id], ajustes: [] })
  })

  it('acrescenta um papel com POST do vínculo novo', async () => {
    const corpos: unknown[] = []
    abrir()
    servidor.use(handlerNovoVinculo(thiago, corpos))
    const painel = within(await abrirPainel('Thiago Mendes'))
    await userEvent.click(painel.getByRole('button', { name: '+ Acrescentar papel' }))
    const bloco = within(painel.getByRole('group', { name: 'Vínculo 2' }))
    await userEvent.selectOptions(bloco.getByLabelText('Papel'), 'INSTRUTOR')
    await userEvent.click(await bloco.findByRole('checkbox', { name: 'Companheiro' }))
    await userEvent.click(bloco.getByRole('button', { name: 'Salvar vínculo' }))
    await waitFor(() => expect(corpos).toEqual([{ papel: 'INSTRUTOR', unidadeIds: [], classeIds: [COMPANHEIRO.id], ajustes: [] }]))
  })

  it('desativar pede confirmação: um toque não chama a API, cancelar volta ao botão', async () => {
    const chamadas: string[] = []
    abrir()
    servidor.use(handlerDesativarUsuario({ ...thiago, situacao: 'INATIVO' }, chamadas))
    const painel = within(await abrirPainel('Thiago Mendes'))
    await userEvent.click(painel.getByRole('button', { name: 'Desativar neste clube' }))
    expect(painel.getByText('Desativar Thiago Mendes neste clube? A pessoa perde o acesso a este clube na hora.')).toBeInTheDocument()
    expect(painel.queryByRole('button', { name: 'Desativar neste clube' })).not.toBeInTheDocument()
    expect(chamadas).toEqual([])
    await userEvent.click(painel.getByRole('button', { name: 'Cancelar' }))
    expect(painel.getByRole('button', { name: 'Desativar neste clube' })).toBeInTheDocument()
    expect(chamadas).toEqual([])
  })

  it('desativa neste clube depois de confirmar', async () => {
    const chamadas: string[] = []
    abrir()
    servidor.use(handlerDesativarUsuario({ ...thiago, situacao: 'INATIVO' }, chamadas))
    const painel = within(await abrirPainel('Thiago Mendes'))
    await userEvent.click(painel.getByRole('button', { name: 'Desativar neste clube' }))
    await userEvent.click(painel.getByRole('button', { name: 'Desativar' }))
    await waitFor(() => expect(chamadas).toEqual([thiago.id]))
  })

  it('mostra no bloco o erro de último Adm', async () => {
    abrir()
    servidor.use(handlerRegra422('put', '/api/vinculos/:id', 'ULTIMO_ADM'))
    const painel = within(await abrirPainel('Diretoria'))
    await userEvent.click(painel.getByRole('button', { name: 'Salvar vínculo' }))
    const bloco = within(painel.getByRole('group', { name: 'Vínculo 1' }))
    expect(await bloco.findByRole('alert')).toHaveTextContent('O clube precisa de pelo menos um Adm ativo.')
  })

  it('mostra no bloco o erro de permissão inválida', async () => {
    abrir()
    servidor.use(handlerRegra422('put', '/api/vinculos/:id', 'AJUSTE_INVALIDO'))
    const painel = within(await abrirPainel('Thiago Mendes'))
    await userEvent.click(await painel.findByRole('button', { name: 'Salvar vínculo' }))
    const bloco = within(painel.getByRole('group', { name: 'Vínculo 1' }))
    expect(await bloco.findByRole('alert')).toHaveTextContent('Alguma permissão não vale para este papel.')
  })

  it('mostra o erro de último Adm ao desativar', async () => {
    abrir()
    servidor.use(handlerRegra422('post', '/api/usuarios/:id/desativar', 'ULTIMO_ADM'))
    const painel = within(await abrirPainel('Diretoria'))
    await userEvent.click(painel.getByRole('button', { name: 'Desativar neste clube' }))
    await userEvent.click(painel.getByRole('button', { name: 'Desativar' }))
    expect(await painel.findByRole('alert')).toHaveTextContent('O clube precisa de pelo menos um Adm ativo.')
  })
})
